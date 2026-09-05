# Docker deployment correction — OPAIJA

This document records the user's pasted, SSH-verified handoff summary. It is not an independent live-server verification by this Codex session. The full Desktop file has not been readable here.

## Reported authoritative topology

- Public site: opaija.com; also launch.opaija.com and a staging container.
- Serving container: opaija-book-builder.
- Reported healthy image: opaija-launch:20260811-providerfix2. Preserve this image and its digest as a rollback candidate; re-check the running image before any rollout.
- Host source: /opt/opaija-book-builder; reported not a Git repository.
- Canonical repository: https://github.com/RAYKUNJAL/Opaija.
- /var/www/opaija is stale. Do not edit it or use it for deployment.
- pm2 is empty. Do not create or restart a pm2 application.
- Traefik owns the edge. Do not add a competing Nginx listener or modify unrelated tenants.
- Disk usage was reported at 80%. Measure build space before building; do not prune rollback images or unrelated workloads.
- Preserve the existing data/ volume, mounts, ownership and backup scheme.
- Deployment uses a tagged Docker build, the actual Compose image reference and a matching .runtime-env-* stamp, followed by a Compose rollout and HTTP verification.

The summary does not provide the exact Compose path/project/service, container workdir, data mount mapping, networks, routing file path or env stamp format. Do not guess these from the container name. The container name is not necessarily the Compose service key.

## Access evidence in this session

- The desktop file link points to C:\Users\Banjo\OneDrive\Desktop\OPAIJA-CODEX-SSH-HANDOFF.md.
- Remote Desktop Commander reports no connected device, so the file and Windows SSH environment are unavailable here.
- The scratch runtime has no ~/.ssh/config or ~/.ssh/id_ed25519.
- ssh trini cannot resolve the alias in this runtime.
- Direct SSH to 5.78.105.83 is network-unreachable.

The alias/key on the user's Windows machine are not automatically available in the Codex scratch runtime. Reconnect that existing device through the remote connector. Do not upload private keys or paste secrets into chat. Uploading the non-secret handoff can provide the full instructions, but by itself does not restore SSH connectivity.

## Reconciliation and deployment order

1. Read the full Desktop handoff on the connected device. Use its ssh trini command or exact -F fallback there, without changing HOME or copying credentials.
2. Inspect only the OPAIJA container's selected fields: image ID/tag, health, Compose labels, workdir, mount destinations and network names. Do not print raw docker inspect or resolved Compose output containing environment secrets.
3. Locate the exact Compose project/service and env-file stamping convention from the verified handoff. Read Dockerfile, package metadata and application code while excluding secret/data files. Confirm Node, FFmpeg, FFprobe, font and Goose/Paperclip placement.
4. Capture a restorable source/config backup using existing protected server storage, and a coherent database backup. Record image digests and mount mappings. Account for the reported disk pressure; do not duplicate large data trees needlessly.
5. Copy non-secret source into an isolated reconciliation checkout. Diff deployed code against GitHub and port the draft PR selectively. Preserve newer auth, book-builder, blog and operational code; do not overlay the older repository wholesale.
6. Build a uniquely tagged candidate image using the verified Docker build context. Test it with staging-only storage and the existing staging routing arrangement. No production data migration or second edge service during staging.
7. Validate signup, admin authentication, source review, one real render, job recovery, shared memory and queue permissions. Ensure renderer binaries and font exist in the runtime stage. Preserve the persistent database/render mounts. Verify agent-to-API networking; localhost in one container does not refer to another container.
8. Update only the verified OPAIJA Compose image and matching .runtime-env-* stamp using the established convention. Recreate only the intended application service. Never use docker compose down -v.
9. Verify container health, public/launch routes, signup and authenticated admin workflows. Enable bounded workers only after checks pass. Social planning is not a connected publisher.
10. If verification fails, restore the recorded Compose image/env stamp and recreate the same service. If a database migration occurred, apply its separately tested recovery procedure; image rollback alone does not undo schema/data changes.

## Draft changes corrected by this handoff

- Removed newly proposed systemd planning units that targeted /var/www/opaija.
- Marked the pre-existing host bootstrap and opaija.service obsolete for this live deployment.
- Made the Goose bridge path relative to its verified runtime workdir.
- Changed the Paperclip host-agent example to the reported source directory. This remains an example until runtime location and compiled output are verified.
- Documented Docker-network, persistent-data and runtime-dependency requirements.

No Docker rollout, server edit, secret read, data migration or live health verification occurred in this session.
