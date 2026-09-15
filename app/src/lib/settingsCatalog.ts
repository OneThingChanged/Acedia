import { COMMAND_DEFINITIONS } from "./commandRegistry";
import { toolForId } from "../types";
import { availableSessionWorkerOptions } from "./sessionWorkers";

export type SettingsCategory = "collector" | "idle" | "status" | "commands" | "browser" | "general" | "language" | "agents" | "terminal" | "data" | "shortcuts" | "hooks" | "dashboard" | "remote" | "vcs" | "ssh" | "about";
type Copy = readonly [string, string];
export const SETTINGS_CATEGORIES: Record<SettingsCategory, Copy> = {
  collector: ["사용량 수집 서버", "Usage collector"],
  idle: ["유휴 세션", "Idle sessions"],
  status: ["상태 표시줄", "Status bar"],
  commands: ["명령 및 시작", "Commands & startup"],
  browser: ["브라우저", "Browser"],
  general: ["일반", "General"], language: ["언어", "Language"], agents: ["에이전트", "Agents"],
  terminal: ["터미널", "Terminal"], data: ["데이터 및 세션", "Data & Sessions"],
  shortcuts: ["단축키", "Shortcuts"], hooks: ["에이전트 훅", "Agent Hooks"],
  dashboard: ["대시보드", "Dashboard"], remote: ["리모트", "Remote"],
  vcs: ["버전 관리", "Version Control"], ssh: ["SSH 호스트", "SSH Hosts"], about: ["정보", "About"],
};
export const SETTING_SCOPES = {
  projectStart: { label: ["프로젝트 선택 시", "On project selection"], detail: ["자동 실행을 켜면 프로젝트를 클릭할 때 앱 실행당 한 번 실행합니다. 화면 복원만으로는 실행하지 않습니다.", "When enabled, runs once per app launch on explicit project selection, not on layout restoration."] },
  app: { label: ["즉시 · 이 앱", "Immediate · this app"], detail: ["이 앱의 표시와 동작에 반영됩니다.", "Applies to this app's appearance and behavior."] },
  terminal: { label: ["즉시 · 로컬/SSH", "Immediate · local/SSH"], detail: ["현재 터미널과 새 터미널에 적용합니다. 원격 호스트의 설정 파일은 바꾸지 않습니다.", "Applies to current and new terminals without changing remote host configuration."] },
  newLocal: { label: ["새 로컬 세션", "New local sessions"], detail: ["새 로컬 프로젝트·세션을 만들 때 복사합니다. 기존 세션과 SSH에는 적용하지 않습니다.", "Copied when creating local projects and sessions. Existing sessions and SSH are unchanged."] },
  newSession: { label: ["새 세션 기본값", "New-session default"], detail: ["세션을 만들 때 처음 선택되는 값입니다. 기존 세션의 실행 옵션은 바뀌지 않습니다.", "Initially selected when creating a session. Existing session launch options are unchanged."] },
  profiles: { label: ["로컬 · 계정별", "Local · per account"], detail: ["로그인한 계정을 로컬 세션에서 선택합니다. 기존 세션의 계정은 자동 변경하지 않습니다.", "Choose a signed-in account for local sessions. Existing sessions keep their account."] },
  nextLaunch: { label: ["다음 CLI 실행", "Next CLI launch"], detail: ["저장된 CLI 설정을 다음 로컬 실행부터 사용합니다. 실행 중인 프로세스는 다시 열어야 반영됩니다.", "Saved CLI settings apply to the next local launch. Reopen active processes to apply them."] },
  saved: { label: ["저장 버튼으로 적용", "Apply with Save"], detail: ["이 화면에서 저장해야 반영됩니다. 검색·이동만으로 저장하지 않습니다.", "Changes apply after saving in this panel. Search and navigation do not save changes."] },
  nextService: { label: ["저장 후 · 서버 시작", "Save · next server start"], detail: ["저장한 포트를 다음 서버 시작부터 사용합니다. 실행 중인 서버를 자동 재시작하지 않습니다.", "The saved port is used the next time the server starts, without automatically restarting it."] },
  nextApp: { label: ["저장 후 · 앱 시작", "Save · next app start"], detail: ["저장한 자동 시작 설정은 다음 앱 실행부터 적용합니다.", "The saved autostart setting applies the next time the app starts."] },
  projectHost: { label: ["SSH 프로젝트", "SSH projects"], detail: ["저장한 호스트를 원격 프로젝트에서 선택합니다. 현재 실행 중인 터미널은 바뀌지 않습니다.", "Choose the saved host in remote projects. Active terminals are unchanged."] },
  action: { label: ["직접 실행", "Run explicitly"], detail: ["이동한 항목에서 버튼을 눌러 실행합니다. 검색 결과를 여는 것만으로 실행하지 않습니다.", "Run using the button in this panel. Opening a search result does not run the action."] },
} satisfies Record<string, { label: Copy; detail: Copy }>;
export type SettingScope = keyof typeof SETTING_SCOPES;
export type SettingDefinition = {
  id: string; category: SettingsCategory; label: Copy; scope: SettingScope; keywords: string;
  agentTab?: string; requiresWorkers?: boolean;
};
export type SettingsContext = { buildVariant: "standard" | "company" | "store"; disabledTools: readonly string[] };
export type SettingsNavigation = { id: string; sequence: number; agentTab?: string };
const entry = (id: string, category: SettingsCategory, ko: string, en: string, scope: SettingScope, keywords = "", extra: Partial<SettingDefinition> = {}): SettingDefinition =>
  ({ id, category, label: [ko, en], scope, keywords, ...extra });

export const SETTINGS_CATALOG: readonly SettingDefinition[] = [
  entry("idle.enabled","idle","유휴 세션 자동 중지","Automatically suspend idle sessions","saved","idle sleep suspend restore 메모리"),
  entry("idle.minutes","idle","유휴 시간","Idle time","saved","대기 중지 시간 minutes"),
  ...[
    ["enabled", "상태 표시줄 표시", "Show status bar"], ["codex", "Codex 한도 표시", "Show Codex quota"],
    ["claude", "Claude 한도 표시", "Show Claude quota"], ["gemini", "Gemini 한도 표시", "Show Gemini quota"], ["agy", "Antigravity 한도 표시", "Show Antigravity quota"],
    ["other", "기타 제공자 한도 표시", "Show other provider quotas"], ["resources", "리소스 표시", "Show resources"],
    ["ports", "포트 표시", "Show ports"], ["display", "한도 비율 표시", "Quota percentage display"],
  ].map(([id,ko,en]) => entry("status."+id,"status",ko,en,"app","상태 표시줄 사용 남은 status bar remaining used")),
  entry("commands.library", "commands", "저장 명령", "Saved commands", "action", "전역 프로젝트 실행 shell script global project"),
  entry("commands.startup", "commands", "프로젝트 시작 명령", "Project startup command", "projectStart", "자동 실행 startup script"),
  entry("browser.profiles", "browser", "브라우저 프로필", "Browser profiles", "saved", "로그인 쿠키 계정 cookies login account"),
  entry("browser.defaultProfile", "browser", "기본 브라우저 프로필", "Default browser profile", "saved", "새 탭 계정 new tab"),
  entry("browser.restore", "browser", "웹 탭 복원", "Restore web tabs", "saved", "재시작 restart restore"),
  entry("browser.home", "browser", "시작 페이지", "Home page", "saved", "새 탭 new tab homepage"),
  entry("browser.search", "browser", "검색엔진", "Search engine", "saved", "주소창 google bing duckduckgo address"),
  entry("browser.zoom", "browser", "기본 확대율", "Default zoom", "saved", "배율 scale"),
  entry("browser.links", "browser", "웹 링크 열기", "Open web links", "saved", "내부 외부 internal external"),
  entry("general.theme", "general", "테마", "Theme", "app", "모양 appearance soft warm light"),
  entry("general.sound", "general", "알림음", "Notification sound", "app", "소리 sound TTS 음성 custom 파일 메시지 message"),
  entry("general.notifications", "general", "Windows 알림 표시", "Show Windows notifications", "app", "notification 알림 배너"),
  entry("general.completion", "general", "완료 알림", "Completion alerts", "saved", "notification done"),
  entry("general.bell", "general", "터미널 벨 알림", "Terminal bell alerts", "saved", "bell 알림"),
  entry("general.suppressFocused", "general", "앱 집중 중 알림 억제", "Suppress alerts while focused", "saved", "focus 집중 방해 금지"),
  entry("general.power", "general", "절전 방지", "Prevent sleep", "saved", "power awake 작업 중"),
  entry("general.alertTest", "general", "알림 테스트", "Test notification", "action", "테스트 알림 test"),
  entry("general.pet", "general", "데스크톱 펫", "Desktop Pet", "app", "작업 상태 화면 위 위치 초기화 status position"),
  entry("language.display", "language", "앱 언어", "App language", "app", "한국어 영어 시스템 기본 korean english system"),
  ...[
    ["font", "글꼴", "Font family", "폰트 font family monospace"],
    ["fontSize", "글자 크기", "Font size", "Ctrl 휠 wheel 글씨"],
    ["lineHeight", "줄 간격", "Line height", "행간 line spacing"],
    ["cursorStyle", "커서 모양", "Cursor shape", "블록 세로 막대 밑줄 block bar underline"],
    ["cursorBlink", "커서 깜빡임", "Blinking cursor", "blink"],
    ["scrollback", "스크롤 이력 행 수", "Scrollback rows", "history 스크롤백 기록"],
    ["copyOnSelect", "선택하면 복사", "Copy on select", "클립보드 clipboard"],
    ["rightClickToPaste", "우클릭으로 붙여넣기", "Right-click to paste", "클립보드 clipboard"],
  ].map(([id, ko, en, keywords]) => entry("terminal." + id, "terminal", ko, en, "terminal", keywords)),
  entry("terminal.reset", "terminal", "터미널 기본값 복원", "Restore terminal defaults", "action", "초기화 reset"),
  entry("agents.common.usage", "agents", "작업표시줄 사용량 표시", "Show usage status bar", "app", "quota 한도 하단", { agentTab: "common" }),
  entry("agents.common.installation", "agents", "설치 상태", "Installation status", "action", "도구 감지 설치 경로 detected CLI", { agentTab: "common" }),
  ...["codex", "claude", "agy", "qwen", "cline"].flatMap(tool => {
    const extra = { agentTab: tool };
    return [
      entry("agents." + tool + ".enabled", "agents", "도구 사용", "Tool enabled", "app", "도구 목록 enable 연결", extra),
      entry("agents." + tool + ".executable", "agents", "CLI 실행 경로", "CLI executable path", "newLocal", "고급 실행 파일 자동 감지 직접 지정 PATH advanced auto detect", extra),
      entry("agents." + tool + ".args", "agents", "추가 실행 인수", "Additional arguments", "newLocal", "고급 옵션 arguments flags advanced", extra),
      entry("agents." + tool + ".env", "agents", "환경변수", "Environment variables", "newLocal", "고급 환경 변수 env environment advanced", extra),
      ...(toolForId(tool).dangerousFlag ? [entry("agents." + tool + ".dangerous", "agents", "권한 확인 생략", "Skip approval prompts", "newSession", "승인 dangerous permissions yolo", extra)] : []),
      ...(["codex", "claude"].includes(tool) ? [
        entry("agents." + tool + ".accounts", "agents", "로그인 계정", "Login accounts", "profiles", "계정 추가 등록 로그인 이름 이메일 login account profile email", extra),
        entry("agents." + tool + ".defaultAccount", "agents", "기본 계정", "Default account", "newLocal", "account login 로그인", extra),
      ] : []),
    ];
  }),
  entry("agents.codex.altScreen", "agents", "Alt-screen 모드", "Alt-screen mode", "newSession", "대체 화면 alternate screen", { agentTab: "codex" }),
  entry("agents.codex.workers.documents", "agents", "문서·Markdown 작업자", "Documents and Markdown worker", "newSession", "병렬 작업자 프리셋 parallel workers", { agentTab: "codex", requiresWorkers: true }),
  entry("agents.codex.workers.html", "agents", "HTML 작업자", "HTML worker", "newSession", "병렬 작업자 프리셋 parallel workers", { agentTab: "codex", requiresWorkers: true }),
  entry("agents.qwen.region", "agents", "Qwen 리전 (나라)", "Qwen region", "nextLaunch", "나라 국가 country ModelStudio", { agentTab: "qwen" }),
  entry("data.storage", "data", "대화·산출물 저장 위치", "Conversation and artifact storage", "action", "데이터 경로 SQLite storage root 데이터베이스"),
  ...COMMAND_DEFINITIONS.map(command => entry("shortcuts." + command.id, "shortcuts", command.title, command.titleEn, "app", command.description + " " + command.descriptionEn + " keyboard shortcut 키보드")),
  entry("hooks.repair", "hooks", "Hook 점검 및 복구", "Check and repair hooks", "action", "에이전트 hooks repair codex claude"),
  entry("collector.server", "collector", "사용량 수집 서버", "Usage collector server", "saved", "회사 중앙 토큰 직원 계정 telemetry token employee account"),
  entry("dashboard.server", "dashboard", "대시보드 서버", "Dashboard server", "action", "로컬 모니터링 시작 중지 local monitor"),
  entry("dashboard.port", "dashboard", "대시보드 포트", "Local dashboard port", "nextService", "서버 server"),
  entry("dashboard.autostart", "dashboard", "대시보드 자동 시작", "Start dashboard when Acedia starts", "nextApp", "autostart startup"),
  entry("dashboard.usage", "dashboard", "사용량 데이터", "Usage data", "action", "토큰 통계 재수집 rescan ingest tokens"),
  ...[
    ["server", "리모트 서버", "Remote server", "action", "PWA 모바일 시작 중지 mobile"],
    ["tunnel", "터널 연결", "Tunnel connection", "action", "외부 접속 tunnel start stop"],
    ["clientId", "로그인 Client ID", "Login Client ID", "saved", "인증 OAuth client"],
    ["owner", "소유자 계정", "Owner account", "saved", "항상 허용 username owner"],
    ["clientSecret", "로그인 Client Secret", "Login Client Secret", "saved", "인증 OAuth 비밀 키"],
    ["tunnelToken", "터널 토큰", "Tunnel token", "saved", "cloudflare named quick"],
    ["hostname", "공개 호스트 이름", "Public hostname", "saved", "도메인 domain"],
    ["port", "리모트 서버 포트", "Remote server port", "saved", "로컬 port"],
    ["access", "접근 승인", "Access approval", "action", "승인 거절 해제 pending approved revoke"],
  ].map(([id, ko, en, scope, keywords]) => entry("remote." + id, "remote", ko, en, scope as SettingScope, keywords)),
  entry("vcs.diff", "vcs", "외부 diff 프로그램", "External diff program", "saved", "비교 프로그램 git source control difftool"),
  ...[
    ["hosts", "등록된 SSH 호스트", "Saved SSH hosts", "추가 편집 삭제 연결 saved add edit delete"],
    ["label", "호스트 표시 이름", "Host label", "이름 label"],
    ["os", "원격 운영체제", "Remote OS", "windows linux posix cmd shim npm"],
    ["user", "SSH 사용자", "SSH user", "사용자 user"],
    ["host", "SSH 호스트 주소", "SSH host address", "주소 host server"],
    ["port", "SSH 포트", "SSH port", "port 22"],
    ["auth", "SSH 인증 방식", "SSH authentication", "비밀번호 password identity key 키 파일"],
    ["options", "추가 SSH 옵션", "Extra SSH options", "인수 arguments options"],
  ].map(([id, ko, en, keywords]) => entry("ssh." + id, "ssh", ko, en, "projectHost", keywords)),
  entry("about.update", "about", "버전 및 업데이트", "Version and updates", "action", "업데이트 설치 update install channel"),
  entry("about.diagnostics", "about", "진단 번들 저장", "Save diagnostic bundle", "action", "진단 로그 diagnostics support"),
];
const byId = new Map(SETTINGS_CATALOG.map(item => [item.id, item]));
export const settingById = (id: string) => byId.get(id);
export const availableSettings = (context: SettingsContext) => SETTINGS_CATALOG.filter(item =>
  !(context.buildVariant === "company" && item.category === "remote") &&
  (!item.requiresWorkers || availableSessionWorkerOptions(context.disabledTools).length > 0));
export function settingBreadcrumb(item: SettingDefinition, text: (ko: string, en: string) => string) {
  const category = text(...SETTINGS_CATEGORIES[item.category]);
  return item.agentTab ? category + " › " + (item.agentTab === "common" ? text("공통", "General") : toolForId(item.agentTab).label) : category;
}
const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
export function searchSettings(query: string, context: SettingsContext, text: (ko: string, en: string) => string = (_ko, en) => en) {
  const tokens = query.trim().split(/\s+/).filter(Boolean).map(normalize);
  if (!tokens.length) return [];
  return availableSettings(context).map((item, order) => {
    const scope = SETTING_SCOPES[item.scope];
    const labels = [...item.label, text(...item.label)].map(normalize);
    const haystack = normalize([...labels, ...SETTINGS_CATEGORIES[item.category], settingBreadcrumb(item, text), item.keywords, ...scope.label].join(" "));
    const score = tokens.every(token => haystack.includes(token))
      ? labels.some(label => label === normalize(query)) ? 3 : tokens.every(token => labels.some(label => label.includes(token))) ? 2 : 1 : 0;
    return { item, score, order };
  }).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score || a.order - b.order).map(hit => hit.item);
}
