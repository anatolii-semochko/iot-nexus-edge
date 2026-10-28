// Package extrares merges an optional extra profiles/devices directory
// (EXTRA_RES_DIR, extension points design - AGENTS_TO_DO.md 2026-07-28) into
// this service's own ./res/profiles and ./res/devices before the EdgeX
// SDK's startup.Bootstrap runs.
//
// The SDK's Device.ProfilesDir/DevicesDir config keys each take exactly
// one directory (device-sdk-go/v4 internal/provision.LoadProfiles -
// verified by reading the SDK source, not assumed), and the loading
// itself happens inside startup.Bootstrap with no exposed hook to add a
// second source - internal/provision isn't importable from outside the
// SDK module. Symlinking extra files into the one directory the SDK
// already scans is the only integration point available without forking
// the SDK.
package extrares

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Merge symlinks every *.yaml/*.yml file from each extra root's
// profiles/ into resProfilesDir and devices/ into resDevicesDir.
// EXTRA_RES_DIR is one directory or several, comma-separated (a project
// built on another project's packages - the demo on the aquarium's; B2,
// iot AGENTS_TO_DO.md 2026-10-17), merged in order. A no-op if it is
// unset (this repo's own docker-compose) or a subdirectory doesn't exist.
// Fails loudly on a filename collision (with a built-in file or another
// root's) rather than silently letting one shadow the other.
func Merge(resProfilesDir, resDevicesDir string) error {
	for _, extraDir := range strings.Split(os.Getenv("EXTRA_RES_DIR"), ",") {
		extraDir = strings.TrimSpace(extraDir)
		if extraDir == "" {
			continue
		}
		if err := mergeInto(filepath.Join(extraDir, "profiles"), resProfilesDir); err != nil {
			return fmt.Errorf("extrares: %s profiles: %w", extraDir, err)
		}
		if err := mergeInto(filepath.Join(extraDir, "devices"), resDevicesDir); err != nil {
			return fmt.Errorf("extrares: %s devices: %w", extraDir, err)
		}
	}
	return nil
}

func mergeInto(srcDir, dstDir string) error {
	entries, err := os.ReadDir(srcDir)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		ext := filepath.Ext(entry.Name())
		if ext != ".yaml" && ext != ".yml" {
			continue
		}

		dst := filepath.Join(dstDir, entry.Name())
		src, err := filepath.Abs(filepath.Join(srcDir, entry.Name()))
		if err != nil {
			return err
		}

		if existing, err := os.Readlink(dst); err == nil {
			// Already a symlink from a previous run of this same function
			// (docker compose restart reuses the container's filesystem,
			// unlike a fresh `up` - Merge() runs again on every process
			// start, found live 2026-07-29). Same source - already
			// correctly merged, nothing to do. Different source - a real
			// collision (two different EXTRA_RES_DIR entries want the same
			// filename), still fails loudly.
			if existing == src {
				continue
			}
			return fmt.Errorf("%s already symlinked to %s, not %s (built-in vs extra name collision)", dst, existing, src)
		} else if _, err := os.Lstat(dst); err == nil {
			// Exists but isn't a symlink at all - a real built-in file.
			return fmt.Errorf("%s already exists (built-in vs extra name collision)", dst)
		} else if !os.IsNotExist(err) {
			return err
		}

		if err := os.Symlink(src, dst); err != nil {
			return err
		}
	}
	return nil
}
