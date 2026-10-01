export type AccountId = "yun" | "sibling";
export type PostStatus =
  "scheduled" | "review" | "published" | "approved" | "failed";
export type MockPost = {
  id: string;
  accountId: AccountId;
  title: string;
  body: string;
  time: string;
  category: string;
  status: PostStatus;
};

// Fixed demo day keeps the prerendered HTML and browser render identical.
export const demoDate = {
  iso: "2026-10-01",
  label: "2026년 10월 1일 목요일",
  short: "10월 1일",
};
export const accounts = [
  {
    id: "yun",
    name: "yun",
    handle: "@yun.tech",
    initials: "Y",
    color: "peach",
    description: "테크 · 일상의 발견",
  },
  {
    id: "sibling",
    name: "동생",
    handle: "@duo.studio",
    initials: "D",
    color: "sage",
    description: "음악 · 스튜디오 이야기",
  },
] as const;

export const initialPosts: MockPost[] = [
  {
    id: "p01",
    accountId: "yun",
    title: "무선마이크, 가격보다 중요한 것",
    body: "무선마이크를 고를 때 스펙보다 먼저 보는 건 실제로 쓰는 공간이에요. 여러분은 어떤 기준으로 고르시나요?",
    time: "10:30",
    category: "비교형",
    status: "scheduled",
  },
  {
    id: "p02",
    accountId: "sibling",
    title: "작은 녹음실의 아침 루틴",
    body: "녹음실 문을 열면 가장 먼저 하는 일. 장비를 켜기 전에 5분 동안 조용히 공간의 소리를 들어봅니다.",
    time: "12:40",
    category: "경험형",
    status: "scheduled",
  },
  {
    id: "p03",
    accountId: "yun",
    title: "SSD 선택할 때 놓치기 쉬운 3가지",
    body: "용량과 속도만 보고 고르기 쉬운 SSD. 발열, 보증 기간, 내가 실제로 옮기는 파일도 함께 살펴보세요.",
    time: "15:30",
    category: "정보형",
    status: "scheduled",
  },
  {
    id: "p04",
    accountId: "sibling",
    title: "좋은 소리는 좋은 질문에서",
    body: "오늘 작업을 시작하기 전에 한 가지 질문을 적어봤어요. 이 곡에서 가장 잘 들려야 하는 건 뭘까요?",
    time: "17:00",
    category: "질문형",
    status: "scheduled",
  },
  {
    id: "p05",
    accountId: "yun",
    title: "책상 위 케이블 정리의 작은 변화",
    body: "케이블 하나를 정리했을 뿐인데 작업을 시작하는 마음이 달라졌어요.",
    time: "18:00",
    category: "경험형",
    status: "scheduled",
  },
  {
    id: "p06",
    accountId: "sibling",
    title: "오늘의 플레이리스트",
    body: "집중이 필요한 오후에는 가사 없는 음악을 틀어둡니다. 오늘은 어떤 음악과 함께하고 있나요?",
    time: "19:00",
    category: "대화형",
    status: "scheduled",
  },
  {
    id: "p07",
    accountId: "yun",
    title: "업그레이드 전에 확인할 것",
    body: "새 장비를 사기 전에 지금 쓰는 장비의 불편한 점을 세 가지만 적어보세요.",
    time: "20:00",
    category: "정보형",
    status: "scheduled",
  },
  {
    id: "p08",
    accountId: "sibling",
    title: "작업을 마무리하는 나만의 방법",
    body: "내일의 나를 위해 마지막 10분은 파일 정리와 메모에 써요.",
    time: "21:00",
    category: "경험형",
    status: "scheduled",
  },
  {
    id: "r01",
    accountId: "yun",
    title: "그래픽카드, 어디에 돈을 쓸까요?",
    body: "이번 PC 조립에서 가장 오래 고민한 게 그래픽카드였어요. 스펙보다 내가 하는 작업을 먼저 적어보니 선택이 조금 쉬워졌습니다. 여러분의 기준은 뭔가요?",
    time: "미정",
    category: "질문형",
    status: "review",
  },
  {
    id: "r02",
    accountId: "sibling",
    title: "녹음실 운영에서 배운 한 가지",
    body: "좋은 장비만큼 중요한 건 편하게 이야기할 수 있는 분위기였어요. 녹음 전에 나누는 짧은 대화가 결과를 바꾸기도 합니다.",
    time: "미정",
    category: "경험형",
    status: "review",
  },
  {
    id: "r03",
    accountId: "yun",
    title: "나에게 맞는 키보드 찾기",
    body: "키보드를 고를 때 소리와 타건감 중 어떤 게 더 중요한가요? 같은 스위치도 책상과 공간에 따라 느낌이 달라지더라고요.",
    time: "미정",
    category: "대화형",
    status: "review",
  },
  {
    id: "d01",
    accountId: "yun",
    title: "10월, 새로운 작은 실험",
    body: "이번 달에는 매일 하나씩 작은 발견을 기록해보려고 해요.",
    time: "08:00",
    category: "경험형",
    status: "published",
  },
  {
    id: "d02",
    accountId: "sibling",
    title: "오늘도 스튜디오에서",
    body: "따뜻한 커피 한 잔과 함께 오늘의 작업을 시작합니다.",
    time: "08:30",
    category: "경험형",
    status: "published",
  },
  {
    id: "d03",
    accountId: "yun",
    title: "오래 쓰는 물건의 공통점",
    body: "자주 손이 가는 물건은 복잡한 기능보다 기본이 잘 되어 있는 것 같아요.",
    time: "09:00",
    category: "정보형",
    status: "published",
  },
  {
    id: "d04",
    accountId: "sibling",
    title: "음악을 듣는 시간",
    body: "작업 없이 음악만 듣는 시간을 조금씩 만들고 있어요.",
    time: "09:30",
    category: "대화형",
    status: "published",
  },
];

export function createMockVariants(topic: string) {
  // Template output only: no model, network request, or external service.
  return [
    {
      type: "질문형",
      text: `${topic}, 여러분은 어떤 기준으로 선택하시나요? 서로의 경험을 듣고 싶어요.`,
    },
    {
      type: "경험형",
      text: `최근 ${topic}에 대해 고민해봤어요. 먼저 나에게 필요한 것부터 적어보니 생각이 정리되더라고요.`,
    },
    {
      type: "정보형",
      text: `${topic}을 살펴볼 때는 사용 목적, 예산, 오래 쓸 수 있는지를 함께 확인해보세요.`,
    },
    {
      type: "비교형",
      text: `${topic}, 무조건 좋은 것보다 내 상황에 맞는 선택이 중요할 수 있어요. 각자의 장단점을 적어볼까요?`,
    },
    {
      type: "대화형",
      text: `오늘의 이야기 주제는 ${topic}입니다. 여러분의 작은 팁이나 경험을 댓글로 나눠주세요.`,
    },
  ];
}
