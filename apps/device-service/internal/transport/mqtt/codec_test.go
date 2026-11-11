package mqtt

import (
	"testing"

	"github.com/edgexfoundry/go-mod-core-contracts/v4/common"
	"github.com/edgexfoundry/go-mod-core-contracts/v4/models"
)

func TestDecodePayload(t *testing.T) {
	cases := []struct {
		valueType string
		payload   string
		want      any
	}{
		{common.ValueTypeBool, "true", true},
		{common.ValueTypeBool, " 0\n", false},
		{common.ValueTypeBool, "ON", true},
		{common.ValueTypeFloat32, "21.5", float32(21.5)},
		{common.ValueTypeFloat64, "-3.25", -3.25},
		{common.ValueTypeInt32, "-42", int32(-42)},
		{common.ValueTypeUint8, "255", uint8(255)},
		{common.ValueTypeString, " hello ", " hello "},
	}
	for _, c := range cases {
		got, err := decodePayload(c.valueType, []byte(c.payload))
		if err != nil {
			t.Fatalf("%s %q: unexpected error %v", c.valueType, c.payload, err)
		}
		if got != c.want {
			t.Fatalf("%s %q: got %#v, want %#v", c.valueType, c.payload, got, c.want)
		}
	}

	for _, bad := range []struct{ valueType, payload string }{
		{common.ValueTypeBool, "maybe"},
		{common.ValueTypeUint8, "256"},
		{common.ValueTypeInt32, "1.5"},
		{common.ValueTypeBinary, "x"},
	} {
		if _, err := decodePayload(bad.valueType, []byte(bad.payload)); err == nil {
			t.Fatalf("%s %q: expected an error", bad.valueType, bad.payload)
		}
	}
}

func TestEncodeRoundTrip(t *testing.T) {
	for _, c := range []struct {
		valueType string
		value     any
	}{
		{common.ValueTypeBool, true},
		{common.ValueTypeFloat32, float32(12.7)},
		{common.ValueTypeFloat64, 0.1},
		{common.ValueTypeInt16, int16(-7)},
		{common.ValueTypeUint32, uint32(4000000000)},
		{common.ValueTypeString, "AUTO -\n59.1W"},
	} {
		payload, err := encodePayload(c.valueType, c.value)
		if err != nil {
			t.Fatalf("%s %v: encode: %v", c.valueType, c.value, err)
		}
		got, err := decodePayload(c.valueType, payload)
		if err != nil {
			t.Fatalf("%s %q: decode: %v", c.valueType, payload, err)
		}
		if got != c.value {
			t.Fatalf("%s: round trip got %#v, want %#v", c.valueType, got, c.value)
		}
	}
	if _, err := encodePayload(common.ValueTypeBool, "true"); err == nil {
		t.Fatal("expected a type mismatch error")
	}
}

func TestDeviceConfigAndTopics(t *testing.T) {
	dev, err := deviceConfigFrom("ai-camera-01-image-caster", models.ProtocolProperties{"type": "mqtt", "node": "ai-camera-01", "device": "image-caster"})
	if err != nil {
		t.Fatal(err)
	}
	if got := deviceTopic("nexus", dev, suffixSet); got != "nexus/ai-camera-01/image-caster/set" {
		t.Fatalf("set topic: %s", got)
	}

	dev, err = deviceConfigFrom("probe", models.ProtocolProperties{"type": "mqtt", "node": "bench"})
	if err != nil {
		t.Fatal(err)
	}
	if dev.Device != "probe" {
		t.Fatalf("device should default to the EdgeX device name, got %q", dev.Device)
	}
	if got := stateSubscription("nexus"); got != "nexus/+/+/state" {
		t.Fatalf("subscription: %s", got)
	}

	if _, err := deviceConfigFrom("x", models.ProtocolProperties{"type": "mqtt"}); err == nil {
		t.Fatal("missing node must be rejected")
	}
	if _, err := deviceConfigFrom("x", models.ProtocolProperties{"type": "mqtt", "node": "a/b"}); err == nil {
		t.Fatal("a node with '/' must be rejected")
	}
}
