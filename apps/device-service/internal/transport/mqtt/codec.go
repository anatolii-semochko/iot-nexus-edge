package mqtt

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/edgexfoundry/go-mod-core-contracts/v4/common"
)

// Payloads are plain UTF-8 text of the value ("21.5", "true", "hello") -
// the simplest thing for firmware to produce and parse, and readable in
// any MQTT client while debugging. Binary payloads (images) arrive with the
// Media Store stage and are not handled here yet.

// decodePayload parses a received payload into a Go value of valueType.
func decodePayload(valueType string, payload []byte) (any, error) {
	s := strings.TrimSpace(string(payload))
	switch valueType {
	case common.ValueTypeBool:
		switch strings.ToLower(s) {
		case "true", "1", "on":
			return true, nil
		case "false", "0", "off":
			return false, nil
		}
		return nil, fmt.Errorf("invalid Bool payload %q", s)
	case common.ValueTypeString:
		// Raw, not trimmed - whitespace may be meaningful in a string value.
		return string(payload), nil
	case common.ValueTypeInt8:
		v, err := strconv.ParseInt(s, 10, 8)
		return int8(v), wrap(valueType, s, err)
	case common.ValueTypeInt16:
		v, err := strconv.ParseInt(s, 10, 16)
		return int16(v), wrap(valueType, s, err)
	case common.ValueTypeInt32:
		v, err := strconv.ParseInt(s, 10, 32)
		return int32(v), wrap(valueType, s, err)
	case common.ValueTypeInt64:
		v, err := strconv.ParseInt(s, 10, 64)
		return v, wrap(valueType, s, err)
	case common.ValueTypeUint8:
		v, err := strconv.ParseUint(s, 10, 8)
		return uint8(v), wrap(valueType, s, err)
	case common.ValueTypeUint16:
		v, err := strconv.ParseUint(s, 10, 16)
		return uint16(v), wrap(valueType, s, err)
	case common.ValueTypeUint32:
		v, err := strconv.ParseUint(s, 10, 32)
		return uint32(v), wrap(valueType, s, err)
	case common.ValueTypeUint64:
		v, err := strconv.ParseUint(s, 10, 64)
		return v, wrap(valueType, s, err)
	case common.ValueTypeFloat32:
		v, err := strconv.ParseFloat(s, 32)
		return float32(v), wrap(valueType, s, err)
	case common.ValueTypeFloat64:
		v, err := strconv.ParseFloat(s, 64)
		return v, wrap(valueType, s, err)
	default:
		return nil, fmt.Errorf("unsupported value type for MQTT transport: %s", valueType)
	}
}

// encodePayload renders a value to be written into its text payload.
func encodePayload(valueType string, value any) ([]byte, error) {
	switch valueType {
	case common.ValueTypeBool:
		v, ok := value.(bool)
		if !ok {
			return nil, fmt.Errorf("expected bool value, got %T", value)
		}
		return []byte(strconv.FormatBool(v)), nil
	case common.ValueTypeString:
		v, ok := value.(string)
		if !ok {
			return nil, fmt.Errorf("expected string value, got %T", value)
		}
		return []byte(v), nil
	case common.ValueTypeFloat32:
		v, ok := value.(float32)
		if !ok {
			return nil, fmt.Errorf("expected float32 value, got %T", value)
		}
		return []byte(strconv.FormatFloat(float64(v), 'f', -1, 32)), nil
	case common.ValueTypeFloat64:
		v, ok := value.(float64)
		if !ok {
			return nil, fmt.Errorf("expected float64 value, got %T", value)
		}
		return []byte(strconv.FormatFloat(v, 'f', -1, 64)), nil
	case common.ValueTypeInt8, common.ValueTypeInt16, common.ValueTypeInt32, common.ValueTypeInt64,
		common.ValueTypeUint8, common.ValueTypeUint16, common.ValueTypeUint32, common.ValueTypeUint64:
		switch value.(type) {
		case int8, int16, int32, int64, uint8, uint16, uint32, uint64:
			return []byte(fmt.Sprintf("%d", value)), nil
		}
		return nil, fmt.Errorf("expected %s value, got %T", valueType, value)
	default:
		return nil, fmt.Errorf("unsupported value type for MQTT transport: %s", valueType)
	}
}

func wrap(valueType, payload string, err error) error {
	if err != nil {
		return fmt.Errorf("invalid %s payload %q: %w", valueType, payload, err)
	}
	return nil
}
