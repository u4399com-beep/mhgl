package api

// R79-b4 (i16-i20) 服务面深审回归钉。
// i16: 任务编辑端点字段白名单完整性 + SQL 列名注入双闸(normalizeTaskData 产出键
// ⊆ 白名单, isValidTaskColumn 再闸 UPDATE 列名)。

import "testing"

// TestI16TaskColumnWhitelistCoversEditableColumns 钉死: taskTextCols/taskIntCols/
// taskBoolCols 三表并集 = Task 表全部用户可编辑列(对照 store.taskCols 去掉
// ruleId/status/progress/stats/createdAt/updatedAt 系统列), 编辑端点无白名单漏项;
// 且三表无重复成员(重复会掩盖漏项)。
func TestI16TaskColumnWhitelistCoversEditableColumns(t *testing.T) {
	editable := map[string]bool{
		"name": true, "mode": true, "engine": true, "bookUrl": true, "bookIds": true,
		"bookIdFrom": true, "bookIdTo": true, "listUrl": true, "listStart": true,
		"listEnd": true, "bookStart": true, "bookEnd": true, "recrawlMode": true,
		"storageMode": true, "fetchConfig": true, "threadMin": true, "threadMax": true,
		"intervalMin": true, "intervalMax": true, "smartCategory": true,
		"smartComplete": true, "autoSuggest": true, "autoRefresh": true,
		"refreshIntervalMin": true,
	}
	seen := map[string]bool{}
	for _, c := range append(append(append([]string{}, taskTextCols...), taskIntCols...), taskBoolCols...) {
		if seen[c] {
			t.Fatalf("白名单列 %s 重复登记(掩盖漏项风险)", c)
		}
		seen[c] = true
		if !editable[c] {
			t.Fatalf("白名单多出非可编辑列 %s", c)
		}
	}
	for c := range editable {
		if !isValidTaskColumn(c) {
			t.Fatalf("可编辑列 %s 不在 isValidTaskColumn 白名单(编辑端点静默丢弃)", c)
		}
	}
}

// TestI16NormalizeTaskDataNoKeyPassthrough 钉死: partial 模式下 normalizeTaskData
// 只输出白名单键 —— body 任意未知/恶意键(如 SQL 片段)不得进入 patch(UPDATE 列名
// 注入双闸第一闸)。
func TestI16NormalizeTaskDataNoKeyPassthrough(t *testing.T) {
	body := map[string]any{
		"name":                "x",
		"status":              "done",
		"progress":            "{}",
		"stats":               "{}",
		"createdAt":           1,
		"name=name,\"id\"=?;": "pwn",
		"ruleId":              "should-not-pass-here",
	}
	patch, nerr := normalizeTaskData(body, false)
	if nerr != "" {
		t.Fatalf("partial 合法字段被误拒: %s", nerr)
	}
	for k := range patch {
		if !isValidTaskColumn(k) {
			t.Fatalf("patch 混入白名单外键 %q(列名注入面)", k)
		}
	}
	if _, has := patch["ruleId"]; has {
		t.Fatal("ruleId 必须经 adminTaskUpdate 专属校验臂, 不得经 normalizeTaskData 透传")
	}
}
