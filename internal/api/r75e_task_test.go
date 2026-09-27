// ============================================================
// [R75-e] 任务编辑闭环 + 报错可见性回归
//
//	① PUT 编辑矩阵: pending 全字段可改(含 bookStart/bookEnd); running/paused
//	  模式字段禁改(明确报错文案); 引擎不在册的 paused 行可改(resume 回落 Start 生效);
//	  引擎在册时修改 tunables → restartHint(前端据此提示「重启后生效」)
//	② lastError 可见性: error/paused 行附最近 error/warn 日志摘要, running 行不带
//
// ============================================================
package api

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"mhgl/internal/auth"
)

// fakeTaskCtl TaskController 假实现(仅 Status 参与 adminTaskUpdate/Detail 判定)
type fakeTaskCtl struct {
	exists   bool
	running  bool
	phase    string
	startErr error
}

func (f *fakeTaskCtl) Start(taskID string) error { return f.startErr }
func (f *fakeTaskCtl) Control(id, action string) (string, error) {
	return "", nil
}
func (f *fakeTaskCtl) Status(taskID string) (bool, bool, string) {
	return f.exists, f.running, f.phase
}
func (f *fakeTaskCtl) StopAll() {}

func r75eDeps(t *testing.T, ctl *fakeTaskCtl) Deps {
	t.Helper()
	d := Deps{DB: newTestDB(t), Auth: auth.NewService("pw", "s", false), Tasks: ctl}
	must67(t)(d.DB.Exec(`INSERT INTO "Rule" (id,name,config,enabled,createdAt,updatedAt) VALUES ('rule-e','规则E','{}',1,1,1)`))
	return d
}

func r75eSeedTask(t *testing.T, d Deps, id, status string) {
	t.Helper()
	must67(t)(d.DB.Exec(`INSERT INTO "Task" (id,ruleId,status,progress,stats,name,mode,bookUrl,bookIds,bookIdFrom,bookIdTo,listUrl,listStart,listEnd,bookStart,bookEnd,recrawlMode,storageMode,engine,fetchConfig,threadMin,threadMax,intervalMin,intervalMax,smartCategory,smartComplete,autoSuggest,autoRefresh,refreshIntervalMin,createdAt,updatedAt)
		VALUES (?,'rule-e',?,'{}','{}','任务E','bookIds','https://x.test/b/{bookId}','1001
1002','','','',1,1,0,0,'incremental','db','go','{}',1,2,500,2000,1,1,1,0,30,1,1)`, id, status))
}

func r75eMust(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("AppendTaskLog: %v", err)
	}
}

// r75eDecode 响应信封解码({ok,data|error})
func r75eDecode(t *testing.T, body string) (bool, map[string]any, string, []map[string]any) {
	t.Helper()
	var env struct {
		OK   bool            `json:"ok"`
		Data json.RawMessage `json:"data"`
		Err  string          `json:"error"`
	}
	if err := json.Unmarshal([]byte(body), &env); err != nil {
		t.Fatalf("decode: %v body=%s", err, body)
	}
	var obj map[string]any
	_ = json.Unmarshal(env.Data, &obj)
	var arr []map[string]any
	_ = json.Unmarshal(env.Data, &arr)
	return env.OK, obj, env.Err, arr
}

func r75ePut(t *testing.T, d Deps, id, body string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest("PUT", "/api/admin/tasks/"+id, strings.NewReader(body))
	req.SetPathValue("id", id)
	rec := httptest.NewRecorder()
	d.adminTaskUpdate(rec, req)
	_, obj, errMsg, _ := r75eDecode(t, rec.Body.String())
	return rec.Code, map[string]any{"data": obj, "error": errMsg}
}

func r75eGetTask(t *testing.T, d Deps, id string) map[string]any {
	t.Helper()
	req := httptest.NewRequest("GET", "/api/admin/tasks/"+id, nil)
	req.SetPathValue("id", id)
	rec := httptest.NewRecorder()
	d.adminTaskDetail(rec, req)
	_, obj, _, _ := r75eDecode(t, rec.Body.String())
	return obj
}

// TestR75e_TaskEditMatrix 编辑闭环实测矩阵(API roundtrip 断言)
func TestR75e_TaskEditMatrix(t *testing.T) {
	t.Run("pending 全字段可改(bookStart/bookEnd 修复面)", func(t *testing.T) {
		d := r75eDeps(t, &fakeTaskCtl{}) // 引擎不在册
		r75eSeedTask(t, d, "t-pending", "pending")
		code, env := r75ePut(t, d, "t-pending",
			`{"name":"改后名","intervalMin":800,"intervalMax":3000,"bookStart":2,"bookEnd":5,"mode":"single","bookUrl":"https://x.test/s/1.html","bookIds":""}`)
		if code != 200 {
			t.Fatalf("pending PUT = %d (%v), want 200", code, env["error"])
		}
		row := r75eGetTask(t, d, "t-pending")
		if row["name"] != "改后名" || row["mode"] != "single" || row["bookStart"] != float64(2) || row["bookEnd"] != float64(5) ||
			row["intervalMin"] != float64(800) || row["intervalMax"] != float64(3000) || row["bookIds"] != "" {
			t.Fatalf("落库验证失败: %v", row)
		}
		if _, has := row["restartHint"]; has {
			t.Fatalf("非在册任务不应带 restartHint")
		}
	})

	t.Run("running 模式字段改 400 且文案明确/非模式字段 200+restartHint", func(t *testing.T) {
		d := r75eDeps(t, &fakeTaskCtl{exists: true, running: true})
		r75eSeedTask(t, d, "t-running", "running")
		code, env := r75ePut(t, d, "t-running", `{"bookIds":"9999"}`)
		if code != 400 || !strings.Contains(env["error"].(string), "任务运行中") {
			t.Fatalf("running 改模式字段 = %d %v, want 400 运行中文案", code, env["error"])
		}
		code, env = r75ePut(t, d, "t-running", `{"name":"改名","intervalMin":900}`)
		if code != 200 {
			t.Fatalf("running 改非模式字段 = %d (%v), want 200", code, env["error"])
		}
		if env["data"].(map[string]any)["restartHint"] != true {
			t.Fatalf("在册任务修改参数应带 restartHint: %v", env["data"])
		}
	})

	t.Run("paused 在册 模式字段改 400 暂停文案/tunables 200+restartHint", func(t *testing.T) {
		d := r75eDeps(t, &fakeTaskCtl{exists: true, running: false})
		r75eSeedTask(t, d, "t-paused", "paused")
		code, env := r75ePut(t, d, "t-paused", `{"bookUrl":"https://x.test/other/{bookId}"}`)
		if code != 400 || !strings.Contains(env["error"].(string), "任务暂停中") {
			t.Fatalf("paused 改模式字段 = %d %v, want 400 暂停文案(修前静默入库, resume 沿用旧 payload)", code, env["error"])
		}
		code, env = r75ePut(t, d, "t-paused", `{"intervalMax":5000}`)
		if code != 200 || env["data"].(map[string]any)["restartHint"] != true {
			t.Fatalf("paused tunables = %d %v, want 200+restartHint", code, env["data"])
		}
	})

	t.Run("paused 但引擎不在册(进程重启) 可改且无 restartHint", func(t *testing.T) {
		d := r75eDeps(t, &fakeTaskCtl{exists: false})
		r75eSeedTask(t, d, "t-paused-gone", "paused")
		code, env := r75ePut(t, d, "t-paused-gone", `{"bookIds":"7777"}`)
		if code != 200 {
			t.Fatalf("引擎不在册 paused 改模式字段 = %d (%v), want 200(resume 回落 Start 重读 DB)", code, env["error"])
		}
		if _, has := env["data"].(map[string]any)["restartHint"]; has {
			t.Fatalf("引擎不在册不应带 restartHint")
		}
	})
}

// TestR75e_TaskLastErrorSurfaces 报错可见性: error/paused 行附最近失败摘要
func TestR75e_TaskLastErrorSurfaces(t *testing.T) {
	d := r75eDeps(t, &fakeTaskCtl{exists: false})
	r75eSeedTask(t, d, "t-err", "error")
	r75eSeedTask(t, d, "t-pz", "paused")
	r75eSeedTask(t, d, "t-run", "running")
	// 日志按时间序追加: info→warn→error; lastError 取最近一条 error/warn(=error)
	r75eMust(t, d.DB.AppendTaskLog("t-err", "info", "《书》批次 #1: 1 线程 × 20 章, 成功 0"))
	r75eMust(t, d.DB.AppendTaskLog("t-err", "warn", "章节失败(1/20 连败): https://x.test/c/1.html: HTTP 404"))
	r75eMust(t, d.DB.AppendTaskLog("t-err", "error", "书籍失败(20/20 连败): https://x.test/b/1.html: 连续 20 章失败, 弃书"))
	r75eMust(t, d.DB.AppendTaskLog("t-pz", "info", "《书》正文队列: 100 章需要采集"))
	r75eMust(t, d.DB.AppendTaskLog("t-pz", "warn", "contents 回调失败: HTTP 500 —— 任务自动暂停(恢复后从断点续采)"))
	r75eMust(t, d.DB.AppendTaskLog("t-run", "info", "《书》批次 #2"))

	// 列表面
	req := httptest.NewRequest("GET", "/api/admin/tasks", nil)
	rec := httptest.NewRecorder()
	d.adminTasksList(rec, req)
	_, _, _, arr := r75eDecode(t, rec.Body.String())
	byID := map[string]map[string]any{}
	for _, row := range arr {
		byID[row["id"].(string)] = row
	}
	if got, _ := byID["t-err"]["lastError"].(string); !strings.Contains(got, "书籍失败(20/20") {
		t.Fatalf("error 行 lastError = %q, want 最近 error 日志(弃书)", got)
	}
	if got, _ := byID["t-pz"]["lastError"].(string); !strings.Contains(got, "contents 回调失败") {
		t.Fatalf("paused 行 lastError = %q, want 最近 warn 日志(自动暂停原因)", got)
	}
	if _, has := byID["t-run"]["lastError"]; has {
		t.Fatalf("running 行不应带 lastError: %v", byID["t-run"]["lastError"])
	}
	// 详情面同口径
	det := r75eGetTask(t, d, "t-err")
	if got, _ := det["lastError"].(string); !strings.Contains(got, "书籍失败") {
		t.Fatalf("详情 lastError = %q", got)
	}
}
