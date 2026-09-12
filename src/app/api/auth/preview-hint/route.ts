// [R15-c] 预览模式后台密码提示: GET /api/auth/preview-hint
// 仅当「非生产运行时」且「生效密码恰为公开的编译期默认值」时返回 {previewPassword},
// 供沙箱预览登录页展示固定密码, 避免用户在预览环境被锁在后台门外。
// 生产构建恒返回空对象; 自定义密码永不外泄(见 src/lib/auth.ts previewHintPassword)。
// 该端点不消耗登录限流配额、不校验会话(未登录者正需要它)。
import { NextResponse } from 'next/server'
import { previewHintPassword } from '@/lib/auth'

export async function GET() {
  const pw = previewHintPassword()
  return NextResponse.json({ ok: true, data: pw ? { previewPassword: pw } : {} })
}
