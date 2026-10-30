#!/usr/bin/env python3
"""Remove files from the bundled FFmpeg runtime that no bundled program can ever load.

The runtime is Termux's general-purpose build. It also ships GLib introspection, video-capture
plugins, headers and static archives that nothing links. A file is removed only when it is
  * build-only material (static archive, header, pkg-config, typelib), or
  * a shared library outside the dynamic-link closure of ffmpeg, ffprobe, python, quickjs and
    every ELF in the Python runtime (resolved like LD_LIBRARY_PATH: python first, then ffmpeg),
and, additionally, its name appears in no reachable binary, so it cannot be a dlopen() target.
Kept entries are copied byte for byte and verified. On anything unexpected the zip is left as is.
The library re-extracts the runtime whenever the zip size changes, so upgrades get a clean copy.

Usage: prune-android-media.py <merged native libs directory>...
"""
import os, struct, sys, zipfile, zlib

def needed(data):
    """DT_NEEDED names of an ELF image, or None when it is not an ELF file."""
    if data[:4] != b'\x7fELF': return None
    is64, e = data[4] == 2, '<' if data[5] == 1 else '>'
    shoff, = struct.unpack_from(e + ('Q' if is64 else 'I'), data, 0x28 if is64 else 0x20)
    shentsize, shnum = struct.unpack_from(e + 'HH', data, 0x3A if is64 else 0x2E)
    sections = [struct.unpack_from(e + ('IIQQQQI' if is64 else 'IIIIIII'), data, shoff + i * shentsize)[1:] for i in range(shnum)]
    names = []
    for kind, _, _, offset, size, link in sections:
        if kind != 6: continue  # SHT_DYNAMIC
        strings, step = sections[link][3], 16 if is64 else 8
        for at in range(offset, offset + size, step):
            tag, value = struct.unpack_from(e + ('qQ' if is64 else 'iI'), data, at)
            if tag == 0: break
            if tag == 1: names.append(data[strings + value:data.index(b'\0', strings + value)].decode())
    return names

def is_link(info): return (info.external_attr >> 16) & 0o170000 == 0o120000

class Package:
    def __init__(self, path):
        self.zip = zipfile.ZipFile(path)
        self.entries = {info.filename: info for info in self.zip.infolist()}
        self.cache = {}
    def read(self, name):
        if name not in self.cache: self.cache[name] = self.zip.read(self.entries[name])
        return self.cache[name]
    def resolve(self, name):
        """Follows symlinks inside the package; None when the name or a link target is missing."""
        for _ in range(16):
            info = self.entries.get(name)
            if info is None or not is_link(info): return None if info is None else name
            name = os.path.normpath(os.path.join(os.path.dirname(name), self.read(name).decode()))
        return None

def removable(directory):
    ffmpeg, python = Package(os.path.join(directory, 'libffmpeg.zip.so')), Package(os.path.join(directory, 'libpython.zip.so'))
    programs = [open(os.path.join(directory, name), 'rb').read() for name in ('libffmpeg.so', 'libffprobe.so', 'libpython.so', 'libqjs.so')]
    reachable, pending = set(), [name for program in programs for name in needed(program) or []]
    # Python imports load any of its own ELF files at runtime, so all of them are roots.
    for name, info in python.entries.items():
        if not is_link(info) and not info.is_dir() and needed(python.read(name)) is not None:
            reachable.add((python, name)); pending += needed(python.read(name))
    seen = set()
    while pending:
        library = pending.pop()
        if library in seen: continue
        seen.add(library)
        for package in (python, ffmpeg):
            target = package.resolve('usr/lib/' + library)
            if target:
                if (package, target) not in reachable:
                    reachable.add((package, target)); pending += needed(package.read(target)) or []
                break
    loaded = b'\0'.join(programs + [package.read(name) for package, name in reachable])
    drop = []
    for name, info in ffmpeg.entries.items():
        if info.is_dir(): continue
        target = ffmpeg.resolve(name)
        build_only = name.endswith(('.a', '.h', '.pc', '.typelib')) or '/include/' in name or '/pkgconfig/' in name
        unlinked = target is not None and (ffmpeg, target) not in reachable and needed(ffmpeg.read(target)) is not None
        dangling = is_link(info) and target is None
        if not (build_only or unlinked or dangling): continue
        base = os.path.basename(name).encode()
        if not build_only and (base.split(b'.so')[0] + b'.so') in loaded: continue  # possible dlopen() target
        drop.append(name)
    # Links into removed files must go too; links into kept files stay.
    gone = set(drop)
    for name, info in ffmpeg.entries.items():
        if is_link(info) and name not in gone and ffmpeg.resolve(name) in gone: drop.append(name)
    return ffmpeg, drop

def rewrite(path, drop):
    """Copies every kept entry's raw bytes and central record; offsets are the only change."""
    data = open(path, 'rb').read()
    end = data.rindex(b'PK\x05\x06')
    count, size, start = struct.unpack_from('<HII', data, end + 10)
    if count == 0xFFFF or start == 0xFFFFFFFF: raise ValueError('zip64 archives are not rewritten')
    body, directory, kept, at = bytearray(), bytearray(), 0, start
    for _ in range(count):
        flags, = struct.unpack_from('<H', data, at + 8)
        csize, = struct.unpack_from('<I', data, at + 20)
        n, m, k = struct.unpack_from('<HHH', data, at + 28)
        local, = struct.unpack_from('<I', data, at + 42)
        record = bytearray(data[at:at + 46 + n + m + k])
        name = data[at + 46:at + 46 + n].decode('utf-8' if flags & 0x800 else 'cp437')
        at += len(record)
        if name in drop: continue
        ln, lm = struct.unpack_from('<HH', data, local + 26)
        stop = local + 30 + ln + lm + csize
        if flags & 0x8: stop += 16 if data[stop:stop + 4] == b'PK\x07\x08' else 12
        struct.pack_into('<I', record, 42, len(body))
        body += data[local:stop]; directory += record; kept += 1
    tail = bytearray(data[end:end + 22 + struct.unpack_from('<H', data, end + 20)[0]])
    struct.pack_into('<HHII', tail, 8, kept, kept, len(directory), len(body))
    return bytes(body + directory + tail)

def verify(original, path, drop):
    candidate = zipfile.ZipFile(path)
    if candidate.testzip() is not None: raise ValueError('rewritten archive failed its checksum test')
    expected = [info for info in original.zip.infolist() if info.filename not in drop]
    actual = candidate.infolist()
    if [info.filename for info in expected] != [info.filename for info in actual]: raise ValueError('entry list changed')
    for before, after in zip(expected, actual):
        if (before.external_attr, before.create_system, before.CRC, before.file_size) != (after.external_attr, after.create_system, after.CRC, after.file_size):
            raise ValueError('entry attributes changed: ' + before.filename)
        if zlib.crc32(candidate.read(after)) != before.CRC: raise ValueError('entry content changed: ' + before.filename)

def prune(directory):
    path = os.path.join(directory, 'libffmpeg.zip.so')
    required = ('libffmpeg.zip.so', 'libpython.zip.so', 'libffmpeg.so', 'libffprobe.so', 'libpython.so', 'libqjs.so')
    if not all(os.path.isfile(os.path.join(directory, name)) for name in required): return
    try:
        original, drop = removable(directory)
        if not drop: return
        temporary = path + '.pruning'
        with open(temporary, 'wb') as output: output.write(rewrite(path, set(drop)))
        verify(original, temporary, set(drop))
        before = os.path.getsize(path)
        os.replace(temporary, path)
        print(f'{os.path.basename(directory)}: removed {len(drop)} unloadable runtime files, {(before - os.path.getsize(path)) / 1e6:.1f} MB')
    except Exception as error:
        if os.path.exists(path + '.pruning'): os.remove(path + '.pruning')
        print(f'{os.path.basename(directory)}: runtime left unchanged ({error})', file=sys.stderr)

if __name__ == '__main__':
    for root in sys.argv[1:]:
        for current, _, files in os.walk(root):
            if 'libffmpeg.zip.so' in files: prune(current)
