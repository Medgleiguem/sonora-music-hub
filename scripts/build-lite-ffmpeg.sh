#!/usr/bin/env bash
# Builds the audio-only FFmpeg used by Sonora Lite, from pinned and verified sources.
#
# It contains everything yt-dlp uses for Sonora's MP3/M4A/Opus downloads (encoders, stream copy with
# aac_adtstoasc/setts, ipod/mp4/mp3/opus/ogg/adts muxers, M4A/HLS/DASH fixups, ffprobe), plus common
# audio decoders and containers. It has no video codecs and no network protocols: yt-dlp downloads in
# Python and only hands FFmpeg local files.
#
# Output per ABI in android/lite-media/<abi>/, in the layout youtubedl-android expects:
#   libffmpeg.so / libffprobe.so   the programs
#   libffmpeg.zip.so               usr/lib/ with the shared FFmpeg libraries they load
#
# Usage: scripts/build-lite-ffmpeg.sh [abi...]   (default: arm64-v8a armeabi-v7a x86_64)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NDK="${ANDROID_NDK_HOME:-$HOME/Android/Sdk/ndk/26.3.11579264}"
API=29
WORK="$ROOT/android/build/lite-ffmpeg"
OUT="$ROOT/android/lite-media"
JOBS="$(nproc 2>/dev/null || echo 4)"

FFMPEG=ffmpeg-7.1.2;  FFMPEG_SHA256=089bc60fb59d6aecc5d994ff530fd0dcb3ee39aa55867849a2bbc4e555f9c304
OPUS=opus-1.5.2;      OPUS_SHA256=65c1d2f78b9f2fb20082c38cbe47c951ad5839345876e46941612ee87f9a7ce1
LAME=lame-3.100;      LAME_SHA256=ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e

fetch() {  # name url sha256
  local file="$WORK/src/$1"
  if [ ! -f "$file" ]; then curl -fsSL -o "$file.part" "$2" && mv "$file.part" "$file"; fi
  echo "$3  $file" | sha256sum -c --quiet - || { rm -f "$file"; echo "Checksum mismatch: $1" >&2; exit 1; }
}

mkdir -p "$WORK/src"
fetch "$FFMPEG.tar.xz" "https://ffmpeg.org/releases/$FFMPEG.tar.xz" "$FFMPEG_SHA256"
fetch "$OPUS.tar.gz" "https://downloads.xiph.org/releases/opus/$OPUS.tar.gz" "$OPUS_SHA256"
fetch "$LAME.tar.gz" "https://downloads.sourceforge.net/project/lame/lame/3.100/$LAME.tar.gz" "$LAME_SHA256"

TOOLS="$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin"
[ -x "$TOOLS/clang" ] || { echo "Android NDK not found at $NDK (set ANDROID_NDK_HOME)." >&2; exit 1; }

build_abi() {
  local abi="$1" host arch cpu asm=()
  case "$abi" in
    arm64-v8a)   host=aarch64-linux-android;     arch=aarch64; cpu=armv8-a ;;
    armeabi-v7a) host=armv7a-linux-androideabi;  arch=arm;     cpu=armv7-a ;;
    # Emulator-only ABI; without nasm installed, FFmpeg's x86 assembly is skipped.
    x86_64)      host=x86_64-linux-android;      arch=x86_64;  cpu=x86-64; command -v nasm >/dev/null || asm=(--disable-x86asm) ;;
    *) echo "Unsupported ABI: $abi" >&2; exit 1 ;;
  esac
  local cc="$TOOLS/$host$API-clang" dir="$WORK/$abi" prefix="$WORK/$abi/prefix"
  # 16 KB alignment keeps the libraries loadable on 16 KB page-size devices.
  local ldflags="-Wl,-z,max-page-size=16384"
  rm -rf "$dir" && mkdir -p "$dir" "$prefix"
  export CC="$cc" AR="$TOOLS/llvm-ar" RANLIB="$TOOLS/llvm-ranlib" STRIP="$TOOLS/llvm-strip" CFLAGS="-O2 -fPIC" LDFLAGS="$ldflags"

  tar -xzf "$WORK/src/$LAME.tar.gz" -C "$dir"
  (cd "$dir/$LAME" && ./configure --host="$host" --prefix="$prefix" --disable-shared --enable-static --disable-frontend --disable-gtktest >/dev/null && make -j"$JOBS" >/dev/null && make install >/dev/null)

  tar -xzf "$WORK/src/$OPUS.tar.gz" -C "$dir"
  (cd "$dir/$OPUS" && ./configure --host="$host" --prefix="$prefix" --disable-shared --enable-static --disable-doc --disable-extra-programs >/dev/null && make -j"$JOBS" >/dev/null && make install >/dev/null)

  tar -xJf "$WORK/src/$FFMPEG.tar.xz" -C "$dir"
  (cd "$dir/$FFMPEG" && PKG_CONFIG_LIBDIR="$prefix/lib/pkgconfig" ./configure \
    --prefix="$prefix" --target-os=android --arch="$arch" --cpu="$cpu" --enable-cross-compile \
    --cc="$cc" --nm="$TOOLS/llvm-nm" --ar="$TOOLS/llvm-ar" --ranlib="$TOOLS/llvm-ranlib" --strip="$TOOLS/llvm-strip" \
    --pkg-config=pkg-config --pkg-config-flags=--static \
    --extra-cflags="-I$prefix/include" --extra-ldflags="-L$prefix/lib $ldflags" --extra-libs="-lm" \
    --enable-shared --disable-static --enable-pic --disable-debug --disable-doc \
    --disable-autodetect --disable-everything --disable-network \
    --disable-avdevice --disable-swscale --disable-postproc --disable-ffplay \
    --enable-ffmpeg --enable-ffprobe --enable-libmp3lame --enable-libopus "${asm[@]}" \
    --enable-protocol=file,pipe \
    --enable-demuxer=matroska,mov,mpegts,mp3,ogg,aac,wav,flac \
    --enable-muxer=ipod,mp4,mov,mp3,opus,ogg,adts,matroska,webm,wav,flac,null \
    --enable-decoder=aac,aac_latm,opus,mp3,mp3float,vorbis,flac,alac,pcm_s16le,pcm_s24le,pcm_f32le \
    --enable-encoder=libmp3lame,libopus,aac \
    --enable-parser=aac,aac_latm,mpegaudio,opus,vorbis,flac,h264,hevc,vp8,vp9,av1 \
    --enable-bsfs \
    --enable-filter=abuffer,abuffersink,aformat,anull,aresample,atrim,volume,buffer,buffersink,format,null,trim \
    >"$dir/configure.log" && make -j"$JOBS" >/dev/null && make install >/dev/null)

  local staged="$dir/stage"
  mkdir -p "$staged/usr/lib" "$OUT/$abi"
  for library in avcodec avformat avfilter avutil swresample; do
    "$TOOLS/llvm-strip" --strip-unneeded -o "$staged/usr/lib/lib$library.so" "$prefix/lib/lib$library.so"
  done
  "$TOOLS/llvm-strip" --strip-unneeded -o "$OUT/$abi/libffmpeg.so" "$prefix/bin/ffmpeg"
  "$TOOLS/llvm-strip" --strip-unneeded -o "$OUT/$abi/libffprobe.so" "$prefix/bin/ffprobe"
  rm -f "$OUT/$abi/libffmpeg.zip.so"
  # Fixed timestamps and order keep the archive (and so the library's size-based version key) reproducible.
  python3 -I - "$staged" "$OUT/$abi/libffmpeg.zip.so" <<'PY'
import os, sys, zipfile
source, target = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for directory, _, files in sorted(os.walk(source)):
        for name in sorted(files):
            path = os.path.join(directory, name)
            info = zipfile.ZipInfo(os.path.relpath(path, source), (1981, 1, 1, 1, 1, 0))
            info.create_system, info.external_attr, info.compress_type = 3, 0o100644 << 16, zipfile.ZIP_DEFLATED
            archive.writestr(info, open(path, 'rb').read(), compresslevel=9)
PY
  echo "$abi: $(du -h "$OUT/$abi/libffmpeg.zip.so" | cut -f1) runtime, $(du -h "$OUT/$abi/libffmpeg.so" | cut -f1) ffmpeg, $(du -h "$OUT/$abi/libffprobe.so" | cut -f1) ffprobe"
}

for abi in "${@:-arm64-v8a armeabi-v7a x86_64}"; do
  for each in $abi; do build_abi "$each"; done
done
