"""Create a reviewable application source archive. Never include credentials or APKs."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent.parent
destination = root / 'mobile-artifacts' / 'sonora-android-source.zip'
destination.parent.mkdir(exist_ok=True)
folders = ['src', 'app', 'lib', 'mobile', 'android', 'scripts', 'tests', 'docs', 'public', 'tasks', '.github']
files = ['package.json', 'package-lock.json', 'capacitor.config.json', 'next.config.mjs', 'playwright.config.js', 'vercel.json', 'README.md', 'DEPLOYMENT.md', 'LICENSE', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md', '.nvmrc', '.env.example', '.gitattributes', '.gitignore', '.vercelignore']
excluded_parts = {'build', '.gradle', '.idea', 'node_modules', 'capacitor-cordova-android-plugins', 'downloads', '__pycache__'}
excluded_names = {'local.properties', 'keystore.properties', 'google-services.json', 'capacitor.config.json', 'capacitor.plugins.json', 'config.xml'}
excluded_suffixes = {'.apk', '.aab', '.aar', '.jks', '.keystore', '.log', '.pyc', '.zip'}

selected = [root / file for file in files if (root / file).is_file()]
for folder in folders:
    for file in (root / folder).rglob('*'):
        if not file.is_file() or file.is_symlink():
            continue
        path = file.relative_to(root)
        if excluded_parts.intersection(path.parts) or file.name in excluded_names or file.suffix in excluded_suffixes:
            continue
        if file.name.startswith('.env') or 'cookies' in file.name.lower() or 'secret' in file.name.lower():
            continue
        if str(path).startswith(('android/app/src/main/assets/public/', 'android/app/src/main/assets/downloader/', 'public/downloads/')):
            continue
        selected.append(file)

with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(set(selected)):
        archive.write(file, Path('sonora') / file.relative_to(root))
    archive.writestr('sonora/SOURCE-REVIEW.txt', 'Sonora application source, licensed under GPL-3.0-only; see LICENSE. Third-party components retain their original licenses. See docs/android.md for build instructions and THIRD_PARTY_NOTICES.md for dependency source/build information. This archive excludes third-party native dependency source, signing keys and service credentials.\n')
print(f'Created {destination.name}: {len(set(selected))} files, {destination.stat().st_size} bytes')
