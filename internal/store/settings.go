// ============================================================
// 全局设置 KV(Setting 表 key/value) + 常用默认值
// 当前 DB Setting 表为空 → 全部走代码内默认; 前台/后台写值后覆盖。
// ============================================================
package store

import "encoding/json"

// GetSetting 读设置; 不存在 → ("", false, nil)。
func (d *DB) GetSetting(key string) (string, bool, error) {
	var v string
	err := d.QueryRow(`SELECT value FROM "Setting" WHERE key=?`, key).Scan(&v)
	if err != nil && err.Error() == "sql: no rows in result set" {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return v, true, nil
}

// SetSetting upsert 设置。
func (d *DB) SetSetting(key, value string) error {
	_, err := d.Exec(`INSERT INTO "Setting" (key,value) VALUES (?,?)
ON CONFLICT(key) DO UPDATE SET value=excluded.value`, key, value)
	return err
}

// AllSettings 全量设置 map。
func (d *DB) AllSettings() (map[string]string, error) {
	rows, err := d.Query(`SELECT key, value FROM "Setting"`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		m[k] = v
	}
	return m, rows.Err()
}

// SettingJSON 读 JSON 结构化设置(反序列化进 out; 缺失/脏 JSON 返回 false 不动 out)。
func (d *DB) SettingJSON(key string, out any) (bool, error) {
	v, ok, err := d.GetSetting(key)
	if err != nil || !ok {
		return false, err
	}
	if err := json.Unmarshal([]byte(v), out); err != nil {
		return false, nil
	}
	return true, nil
}

// SetSettingJSON 序列化写入。
func (d *DB) SetSettingJSON(key string, val any) error {
	b, err := json.Marshal(val)
	if err != nil {
		return err
	}
	return d.SetSetting(key, string(b))
}
