# SPDX-FileCopyrightText: 2026 BlackShield LDA
# SPDX-License-Identifier: Apache-2.0

.PHONY: all linux win mac sandbox icons clean

# Packages for the current platform; output goes to dist/.
all: node_modules
	npm run dist

linux win mac: node_modules
	npm run dist:$@

# Exactly the versions in the lockfile.
node_modules: package.json package-lock.json
	npm ci
	@touch node_modules

# Ubuntu 24.04 and later deny user namespaces, which Chromium's sandbox needs, to programs without
# an AppArmor profile. This gives one to the Electron of this checkout and to the unpacked build, as
# the deb does for the installed application. Needs root, once per checkout.
sandbox:
	printf '%s\n' 'abi <abi/4.0>,' 'include <tunables/global>' \
		'profile mdv-dev "$(CURDIR)/{node_modules/electron/dist/electron,dist/linux-unpacked/mdv}" flags=(unconfined) {' \
		'  userns,' '}' | sudo tee /etc/apparmor.d/mdv-dev > /dev/null
	sudo apparmor_parser --replace /etc/apparmor.d/mdv-dev

# Regenerates the icon bitmaps from build/icon.svg; needs Inkscape.
icons:
	inkscape build/icon.svg --export-type=png --export-filename=build/icon.png -w 1024 -h 1024
	for size in 16 24 32 48 64 128 256 512; do \
		inkscape build/icon.svg --export-type=png --export-filename=build/icons/$${size}x$${size}.png -w $$size -h $$size; \
	done

clean:
	rm -rf out dist
