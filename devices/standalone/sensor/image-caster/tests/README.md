# Tests

The transport side is unit-tested in `apps/device-service`
(`internal/transport/mqtt/media_test.go` - upload, id push, retained
frames ignored, failed upload) and the Media Store in `apps/api`
(`src/fileStore.test.ts`). End-to-end verification is a live
`docker compose` run: a simulated instance fed by a UI upload, and a
physical one fed by `mosquitto_pub -f <image>` on its state topic.
