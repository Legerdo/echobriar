import type { CharId } from '../combat/types';
import type { TrackId } from '../audio/music';
import type { Sfx } from '../audio/audio';

/** 컷신·대화 스크립트 단계 */
export type Step =
  | { say: string; text: string }
  | { flag: string; v?: number }
  | { join: CharId }
  | { give: [string, number] }
  | { battle: string }
  | { heal: true }
  | { sfx: Sfx }
  | { music: TrackId | null }
  | { fade: 'out' | 'in' }
  | { wait: number }
  | { shop: true }
  | { seal: string }
  | { ending: true }
  | { goto: [string, string] }
  | { if: string; then: Step[]; else?: Step[] }
  | { choice: [string, Step[]][] }
  | { hint: string }
  | { removeEnt: string };

export const SPEAKERS: Record<string, { name: string; portrait?: string; sprite?: string }> = {
  kael: { name: '카엘', portrait: 'kael' },
  mira: { name: '미라', portrait: 'mira' },
  sera: { name: '세라', portrait: 'sera' },
  orin: { name: '오린', portrait: 'orin' },
  elder: { name: '장로 하엘', sprite: 'npc_elder_field' },
  merchant: { name: '떠돌이 상인 부아', sprite: 'npc_merchant_field' },
  villager: { name: '피난민', sprite: 'npc_villager_field' },
  child: { name: '아이', sprite: 'npc_child_field' },
  guard: { name: '문지기', sprite: 'npc_guard_field' },
  warden: { name: '잿불 파수꾼', portrait: 'warden' },
  stag: { name: '유리뿔 사슴왕', portrait: 'stag' },
  chorister: { name: '폭풍의 합창자', portrait: 'chorister' },
  knight: { name: '잔향의 기사', portrait: 'thornknight' },
  root: { name: '세계뿌리', portrait: 'frenzy' },
  '': { name: '' },
};

const S = (say: string, text: string): Step => ({ say, text });

export const SCRIPTS: Record<string, Step[]> = {
  intro: [
    { music: 'refuge' },
    S('', '땅 아래에는 세계를 잇는 거대한 생명, 세계뿌리가 있다.'),
    S('', '세 개의 세계 봉인이 뿌리를 잠재워 왔지만, 봉인이 흩어진 지금 뿌리의 상처에서 잔향가시가 자라난다.'),
    S('', '가시는 기억과 지형을 뒤섞고, 생물을 변이시킨다.'),
    S('elder', '카엘, 미라. 동쪽 초원의 풀이 하룻밤 새 잿빛으로 변했다.'),
    S('elder', '뿌리가 앓는 소리가 점점 가까워지고 있어. 초원으로 가서 무슨 일인지 살펴봐 다오.'),
    S('mira', '다녀올게요, 장로님. 카엘, 검은 챙겼지?'),
    S('kael', '늘 챙겨. …가자.'),
    { flag: 'intro' },
    { hint: 'field' },
  ],
  hub_enter: [
    { if: 'seal_ember', then: [{ if: 'thorn_n_seen', else: [S('mira', '봐, 북쪽 가시덤불이 말라 비틀어졌어. 잿불 봉인 덕분이야.'), S('kael', '유리숲으로 가는 길이 열렸군.'), { flag: 'thorn_n_seen' }], then: [] }] },
    { if: 'seal_glass', then: [{ if: 'thorn_w_seen', else: [S('sera', '서쪽 덤불도 걷혔어. 고원으로 갈 수 있겠어.'), { flag: 'thorn_w_seen' }], then: [] }] },
    { if: 'seal_storm', then: [{ if: 'gate_seen', else: [S('orin', '뿌리문이 울린다. 봉인 세 개가 다 모였어.'), S('kael', '심부로 내려갈 때다.'), { flag: 'gate_seen' }], then: [] }] },
  ],
  elder: [
    { if: 'seal_storm', then: [S('elder', '세 봉인이 다 모였구나. 뿌리문이 너희를 기다린다.'), S('elder', '무엇을 선택하든… 돌아오거라.')], else: [
      { if: 'seal_glass', then: [S('elder', '두 번째 봉인까지. 서쪽 고원 끝, 폭풍 성소에 마지막 봉인이 있다.')], else: [
        { if: 'seal_ember', then: [S('elder', '잿불 봉인이라니, 해냈구나. 북쪽 유리숲 너머에 유리 성소가 있다.')], else: [
          S('elder', '초원 동쪽 폐허 밑에 잿불 성소가 있다고 전해진다. 봉인이 그곳에 묻혔을 게야.'),
          S('elder', '휴식 지점에서 쉬면 기력을 되찾고 기록을 남길 수 있다. 무리하지 말거라.'),
        ] },
      ] },
    ] },
  ],
  merchant: [S('merchant', '어서 와. 가시 때문에 길이 험해서 물건값이 조금 올랐어.'), { shop: true }],
  villager: [
    { if: 'seal_ember', then: [S('villager', '밤새 들리던 뿌리 울음이 조금 잦아들었어요. 고마워요.')], else: [S('villager', '우리 마을 우물물까지 잿빛으로 흐려졌어요…')] },
  ],
  child: [
    { if: 'sera_joined', then: [S('child', '세라 누나 활 쏘는 거 봤어? 나도 크면 정찰수 할 거야!')], else: [S('child', '형, 누나. 가시 괴물은 뒤에서 몰래 다가가면 먼저 때릴 수 있대!')] },
  ],
  guard: [S('guard', '동쪽이 재빛 초원이다. 적은 눈에 보이니, 피하든 싸우든 네 선택이야.'), S('guard', '적에게 들키면 쫓아온다. 등 뒤를 잡히면 기습당하니 조심해.')],

  meadow_enter: [
    { if: 'meadow_seen', else: [S('mira', '풀이 전부 재처럼 변했어… 냄새도 이상해.'), S('kael', '저 앞에 뭔가 움직인다. 조심해.'), { flag: 'meadow_seen' }], then: [] },
  ],
  tut1_pre: [S('mira', '가시 사냥개야! 이쪽을 노리고 있어.'), S('kael', '먼저 친다. 등 뒤로 돌아 들어가면 선제 공격이야.'), { flag: 'tut1_talk' }],
  tut1_post: [S('mira', '휴, 생각보다 빨랐어. 공격이 닿는 순간을 잘 봐야겠네.')],
  tut2_pre: [S('kael', '빈 갑주… 다리를 지키고 있군.'), S('mira', '칼을 치켜든 채 멈추는 버릇이 있대. 서두르지 마.')],
  tut2_post: [S('kael', '다리 건너에 불 꺼진 야영지가 있다. 누가 있는 것 같아.'), { flag: 'tut2_done' }],
  sera_join: [
    S('sera', '…거기 둘. 갑주를 쓰러뜨린 게 너희야?'),
    S('mira', '응. 너는 누구야? 여기서 혼자 뭘 하고 있었어?'),
    S('sera', '세라. 가시가 퍼지는 길을 쫓던 정찰수야. 동료들은… 이 야영지에서 흩어졌어.'),
    S('sera', '가시는 동쪽 폐허에서 흘러나와. 성소를 찾는다면 같이 가자. 나는 약점을 보는 눈이 좋거든.'),
    S('kael', '환영한다. 세라.'),
    { join: 'sera' },
    { flag: 'sera_joined' },
    { hint: 'party' },
  ],
  r1_pre: [S('sera', '저건 늪의 호명자. 저주는 막을 수 없으니 피해. 늪 물결이 오면 뛰어.')],
  ruins_enter: [
    { if: 'ruins_seen', else: [S('sera', '여기가 잠긴 폐허야. 옛날 뿌리지기들이 살던 곳이래.'), S('mira', '물이 고여서 발밑이 질척해…'), { flag: 'ruins_seen' }], then: [] },
  ],
  ember_locked: [S('kael', '성소 입구다. …안쪽에서 누군가 도와달라고 외치는 소리가 들렸어. 동쪽 무너진 홀부터 확인하자.')],
  orin_pre: [S('orin', '거기 누구 있어?! 이 껍질 녀석 좀 치워 줘!'), S('mira', '사람이 갇혀 있어! 저 껍질 짐승, 너무 단단해 보여.'), S('sera', '껍질 이음새를 노리거나… 붕괴시켜서 껍질째 깨부수자.')],
  orin_post: [
    S('orin', '살았다! 고마워. 나는 오린. 폐허 기계를 고치러 왔다가 저 녀석한테 몰렸지.'),
    S('orin', '잿불 성소에 간다고? 내 포망치가 도움이 될 거야. 금 간 벽 정도는 한 방이지.'),
    S('kael', '같이 가자, 오린.'),
    { join: 'orin' },
    { flag: 'orin_joined' },
    { hint: 'swap' },
  ],
  orin_wait: [S('orin', '빨리 저 녀석 좀!')],
  shrine_ember_enter: [{ if: 'ember_seen', else: [S('orin', '공기가 뜨거워. 성소 바닥 밑으로 잿불이 흐르고 있어.'), { flag: 'ember_seen' }], then: [] }],
  warden_pre: [
    S('warden', '…돌아가라. 이 불은 누구에게도 넘기지 않는다.'),
    S('kael', '봉인을 되찾아야 해. 세계뿌리가 죽어 가고 있다.'),
    S('warden', '그렇다면 증명해라. 나의 칼을 견딜 수 있는지.'),
    { hint: 'guardian' },
  ],
  warden_post: [
    S('warden', '…좋다. 막는 법을 아는 자에게라면, 불을 맡기지.'),
    { seal: 'seal_ember' },
    S('mira', '잿불 봉인… 따뜻해.'),
    S('sera', '피난처 북쪽 덤불이 이 봉인에 반응할 거야. 돌아가 보자.'),
  ],
  glass_enter: [{ if: 'glass_seen', else: [S('sera', '빛이 여러 갈래로 갈라져… 눈이 따가워.'), S('orin', '유리 속에 불꽃이 갇혀 있어. 핵만 정확히 맞히면 되겠는데.'), { flag: 'glass_seen' }], then: [] }],
  aim_pre: [S('sera', '유리 불꽃은 일렁여서 어설픈 공격은 빗나가. 정밀 조준으로 수정 핵을 노려.'), { hint: 'aim_field' }],
  shrine_glass_enter: [{ if: 'sglass_seen', else: [S('mira', '바닥까지 거울 같아. 누가 우릴 보고 있는 느낌이야.'), { flag: 'sglass_seen' }], then: [] }],
  stag_pre: [
    S('stag', '빛은 갈라지고, 갈라진 빛은 모두를 꿰뚫는다.'),
    S('sera', '갑주 고정쇠랑 뿔이 보여. 저기를 부수면 훨씬 쉬워질 거야.'),
    S('orin', '조준이 어려우면 붕괴로 갑주를 깨도 돼. 방법은 하나가 아니야.'),
  ],
  stag_post: [
    S('stag', '…갈라진 빛을 하나로 모았구나. 가져가라.'),
    { seal: 'seal_glass' },
    S('kael', '두 번째 봉인. 서쪽 고원으로 가자.'),
  ],
  plateau_enter: [{ if: 'plateau_seen', else: [S('orin', '땅이 통째로 갈라졌어. 발밑 조심해.'), S('kael', '거상이 땅을 울리면 뛰어올라. 그것밖에 없다.'), { flag: 'plateau_seen' }], then: [] }],
  elite_pre: [S('sera', '저 거상… 잔향을 잔뜩 머금었어. 숨겨진 강적이야.'), S('orin', '대신 뭔가 좋은 걸 지키고 있을 거야.')],
  shrine_storm_enter: [{ if: 'storm_seen', else: [S('mira', '머리카락이 곤두서… 폭풍이 노래하고 있어.'), { flag: 'storm_seen' }], then: [] }],
  chorister_pre: [
    S('chorister', '들어라, 흩어진 목소리들이 하나로 모이는 소리를.'),
    S('mira', '저 구슬들이 보호막을 보내고 있어. 우리도 합을 맞춰야 해.'),
    { hint: 'build' },
  ],
  chorister_post: [
    S('chorister', '…너희의 합창이 더 크구나. 마지막 봉인을 받아라.'),
    { seal: 'seal_storm' },
    S('orin', '세 개 다 모였어! 피난처의 뿌리문으로!'),
  ],
  depths_enter: [{ if: 'depths_seen', else: [
    S('', '뿌리문 아래, 세계뿌리의 심부. 살아 있는 벽이 느리게 박동한다.'),
    S('sera', '가시가 여기서부터 시작됐어. 심장이 가까워.'),
    S('kael', '마지막 휴식 지점에서 준비를 끝내자.'),
    { flag: 'depths_seen' },
  ], then: [] }],
  final_pre: [
    S('knight', '또 왔구나, 봉인을 든 자들이여. 나는 첫 번째 수호자였다.'),
    S('knight', '뿌리를 지키려다 뿌리의 고통을 삼켰지. 이제 이 고통이 곧 나다.'),
    S('kael', '그 고통, 여기서 끊는다.'),
    { hint: 'final' },
  ],
  final_post: [
    S('root', '………'),
    S('', '광란이 가라앉자, 세계뿌리의 심장이 드러났다. 세 봉인이 손안에서 떨린다.'),
    S('mira', '봉인을 다시 박으면 뿌리는 잠들어. 가시는 멈추지만… 뿌리는 다시는 깨어나지 못할 거야.'),
    S('sera', '아니면 봉인을 뿌리에 녹여 상처를 메울 수도 있어. 대신 세상은 한동안 뒤섞인 채로 남겠지.'),
    S('orin', '결정은 네 몫이야, 카엘.'),
    { choice: [
      ['봉인을 다시 박는다 — 뿌리를 잠재운다', [{ flag: 'ending_seal' }]],
      ['봉인을 뿌리에 녹인다 — 뿌리를 치유한다', [{ flag: 'ending_heal' }]],
    ] },
    { ending: true },
  ],
  rootgate: [
    { if: 'seal_storm', then: [
      S('', '세 봉인이 뿌리문의 홈에 맞물리며 빛난다. 문이 천천히 열린다.'),
      { sfx: 'seal' },
      { flag: 'gate_open' },
      { goto: ['depths', 'north'] },
    ], else: [S('', '거대한 뿌리문. 세 개의 홈이 봉인을 기다리고 있다.')] },
  ],
  crack_need: [S('kael', '금이 간 벽이다. 힘센 동료가 있다면 부술 수 있을 것 같다.')],
};

/** 조사 가능한 표지·벽화·기록 */
export const LORE: Record<string, string[]> = {
  sign_hub: ['동쪽 — 재빛 초원', '북쪽 — 유리숲 (가시덤불로 막힘)', '서쪽 — 부서진 고원 (가시덤불로 막힘)'],
  statue_hub: ['첫 번째 뿌리지기의 석상. 발치에 새겨진 글:', '「뿌리를 지키는 자는, 뿌리의 아픔도 함께 진다.」'],
  sign_meadow: ['서쪽 — 푸른 피난처', '동쪽 — 잠긴 폐허'],
  mural_meadow: ['낡은 벽화. 거대한 뿌리가 세 개의 빛나는 돌에 감겨 잠들어 있다.', '돌의 색은 붉은빛, 푸른빛, 보랏빛이다.'],
  record_camp: ['정찰대 일지 — 「셋째 날. 가시가 밤마다 동쪽에서 번진다.」', '「넷째 날. 대장이 폐허로 갔다. 돌아오지 않는다.」', '「다섯째 날. 갑주가 다리를 막았다. 세라만 남았다.」'],
  mural_seals: ['뿌리지기들의 벽화. 봉인 하나는 불 속에, 하나는 유리 속에, 하나는 폭풍 속에 두었다고 적혀 있다.', '「봉인은 뿌리를 재우는 자장가. 그러나 자장가가 끝나면 누군가는 깨어난다.」'],
  record_ruins: ['녹슨 공구함 위의 쪽지 — 「압력 밸브 교체 완료. 폐허 북쪽 성소 문은 열려 있음. — 오린」'],
  record_ember: ['불에 그을린 석판 — 「파수꾼은 막는 법을 아는 자에게만 불을 넘긴다.」'],
  record_glass: ['유리에 새겨진 글씨 — 「보이는 것만 쏘지 마라. 빛나는 곳을 쏘아라.」'],
  mural_glass: ['유리 벽화. 사슴의 뿔이 빛을 모아 한 줄기로 쏘아 보낸다.', '뿔 아래 갑주를 여미는 고정쇠가 따로 그려져 있다.'],
  record_sglass: ['거울 바닥의 글 — 「갑주를 벗기는 길은 둘. 쇠를 끊거나, 무릎 꿇리거나.」'],
  record_plateau: ['부서진 이정표 — 「고원 서쪽 끝, 폭풍 성소. 거상이 땅을 울리거든 발을 떼라.」'],
  record_storm: ['낙서 — 「합창자는 혼자 노래하지 않는다. 구슬을 깨면 목소리가 줄어든다.」'],
  record_depths: ['뿌리 벽에 스며든 기억 — 「나는 첫 번째 수호자. 아픔을 삼키면 뿌리가 편해질 줄 알았다.」'],
};

/** 전투 튜토리얼 안내 카드. {parry} 등은 현재 키로 치환 */
export const TUTORIALS: Record<string, { title: string; body: string }> = {
  field: { title: '탐험', body: '{move}로 이동, {run}을 누른 채 달리기. {confirm}로 조사·대화·상자 열기.\n적은 필드에 보인다. 등 뒤에서 닿으면 선제 공격, 등을 잡히면 기습당한다.\n{menu}: 메뉴 (파티·기술·유물·설정)' },
  basics: { title: '기본 공격과 행동력', body: '각 동료는 행동력(AP, 최대 10)을 가진다. 자기 턴마다 +1.\n「공격」은 행동력을 만들고, 「기술」은 행동력을 쓴다.\n지금 쓸지, 모아서 큰 기술을 쓸지 고르자.' },
  timing: { title: '공격 타이밍', body: '공격이 닿는 순간 {confirm}. 고리가 표식과 겹칠 때가 완벽.\n실패: 약해짐 · 성공: 정상 · 완벽: 추가 피해·붕괴·행동력 보너스.\n기술마다 입력 방식이 다르다 (한 번 / 여러 번 / 누르고 떼기 / 박자).' },
  dodge: { title: '회피', body: '적 공격이 닿기 직전에 {dodge} — 회피.\n판정이 넓고 안전하지만 보상은 작다. 처음 보는 공격엔 회피가 좋다.' },
  parry: { title: '패링', body: '공격이 닿는 바로 그 순간에 {parry} — 완벽 패링.\n판정이 좁고 헛누르면 잠깐 막을 수 없다. 대신 피해 무효 + 행동력을 얻는다.\n무기를 치켜든 채 멈추는 지연 공격에 속지 마라.' },
  combo: { title: '연속 공격과 반격', body: '연속 공격은 타격마다 따로 판정한다.\n한 공격의 모든 타격을 패링하면 반격이 발동한다 — 큰 피해와 붕괴, 공명.' },
  break: { title: '붕괴', body: '적은 체력 아래에 붕괴 게이지가 있다. 가득 차면 「붕괴 가능」.\n그때 붕괴 가능 기술(설명에 표시)을 쓰면 적이 붕괴한다:\n다음 행동 취소 · 순서 지연 · 받는 피해 증가 · 충전 중인 공격 취소.' },
  status: { title: '상태 효과와 지면 공격', body: '패링 불가 공격(붉은 가시 표식)은 {dodge}로만 피한다.\n지면 공격(물결 표식)은 {jump}로 뛰어넘어야 한다. 회피·패링으로는 못 피한다.\n화상·둔화·혼미 같은 상태는 행동 순서와 피해를 바꾼다.' },
  aim: { title: '정밀 조준', body: '「정밀 조준」: 적을 확대해 직접 겨냥한다. 마우스나 {move}로 조준, {confirm}로 발사.\n빛나는 약점을 맞히면 추가 피해·붕괴·부위 파괴 등 특별한 효과. 세라는 더 싸고 표식을 폭발시킨다.' },
  aim_field: { title: '약점', body: '적 스프라이트의 빛나는 부분이 약점이다. 「조사」로 약점과 공격 방식을 확인할 수 있다.' },
  resonance: { title: '공명', body: '완벽 타이밍, 반격, 약점 명중, 붕괴로 파티 공명이 찬다 (3칸).\n1칸: 구조 · 2칸: 고유 강력기 · 3칸: 파티 연계기. 명령의 「공명」에서 사용.' },
  jump2: { title: '거상', body: '거상의 공격은 대부분 땅을 탄다. 물결 표식이 보이면 {jump}.\n가슴의 핵을 조준하면 붕괴가 빨라진다.' },
  guardian: { title: '수호자', body: '수호자는 지금까지 배운 방어를 모두 시험한다.\n강력한 공격은 한 턴 전에 「준비」가 보인다. 그 사이 붕괴시키면 취소된다.' },
  build: { title: '빌드 시험', body: '합창자는 구슬이 있는 동안 보호막을 두른다. 구슬을 부수거나, 상태 연계·표식 폭발·공명으로 밀어붙여라.\n쉬는 동안 유물과 메아리 조합을 바꿔 보자.' },
  final: { title: '최종 수호자', body: '세 페이즈. 페이즈마다 체력과 패턴이 바뀐다.\n마지막 페이즈의 멸절의 가시는 충전 중에 붕괴시켜야 막을 수 있다.' },
  party: { title: '파티', body: '전투에는 세 명이 참가한다. 휴식 지점이나 메뉴의 「파티」에서 교체할 수 있다.' },
  swap: { title: '네 번째 동료', body: '이제 동료가 넷이다. 한 명은 대기하며 경험치를 조금 받는다.\n메뉴 → 파티에서 전투 참가 인원을 바꿀 수 있다.' },
  relic: { title: '유물과 메아리', body: '유물은 능력치와 고유 효과를 준다 (한 명당 3개).\n장착한 채 싸우면 숙련이 오른다. 숙련이 끝나면 메아리가 되어, 유물을 벗어도 통찰력을 써서 효과를 장착할 수 있다.' },
};

/** 휴식 지점 동료 대화 (진행도별) */
export const CHATS: { need?: string; not?: string; lines: [string, string][] }[] = [
  { not: 'sera_joined', lines: [['mira', '카엘, 너 아까 패링할 때 눈 감았지?'], ['kael', '…안 감았어.'], ['mira', '감았어. 다음엔 끝까지 봐.']] },
  { need: 'sera_joined', not: 'orin_joined', lines: [['sera', '너희 둘, 호흡이 잘 맞네.'], ['mira', '어릴 때부터 같이 자랐거든. 카엘은 말이 없어서 내가 대신 말해.'], ['kael', '…맞는 말이다.']] },
  { need: 'orin_joined', not: 'seal_ember', lines: [['orin', '내 포망치는 충전을 모을수록 세져. 근데 욕심내다 맞으면 끝이지.'], ['sera', '그럼 내가 표식을 남길 테니 그때 터뜨려.'], ['orin', '좋아, 합 맞춰 보자.']] },
  { need: 'seal_ember', not: 'seal_glass', lines: [['mira', '봉인을 쥐고 있으면 뿌리의 심장 소리가 들려.'], ['kael', '아파하는 소리야.'], ['sera', '…그럼 서둘러야겠네.']] },
  { need: 'seal_glass', not: 'seal_storm', lines: [['orin', '파수꾼도 사슴왕도 결국 봉인을 넘겨줬어. 뭔가를 기다렸던 것처럼.'], ['sera', '자기들을 이길 누군가를?'], ['kael', '…아니면 끝낼 누군가를.']] },
  { need: 'seal_storm', lines: [['mira', '카엘. 끝나면 뭐 할 거야?'], ['kael', '피난처 우물을 고칠 거다. 물이 맑아지게.'], ['orin', '그건 내가 도와줄게.'], ['sera', '나는… 흩어진 정찰대를 찾으러 갈 거야.']] },
];

export const ENDINGS: Record<string, string[]> = {
  ending_seal: [
    '세 봉인이 다시 박히자, 세계뿌리는 긴 숨을 내쉬고 잠들었다.',
    '잔향가시는 시들어 재가 되었고, 초원에는 다시 푸른 풀이 돋았다.',
    '뿌리는 더 이상 꿈꾸지 않는다. 세상은 조용하고, 조금 쓸쓸해졌다.',
    '카엘은 피난처의 우물을 고쳤다. 물은 맑았다.',
  ],
  ending_heal: [
    '세 봉인이 녹아 뿌리의 상처로 스며들었다. 세계뿌리가 처음으로 아프지 않은 꿈을 꾼다.',
    '한동안 세상의 길은 뒤섞인 채였다. 초원 한가운데 유리 꽃이 피고, 고원에는 잿불 샘이 솟았다.',
    '그래도 가시는 더는 자라지 않았다. 뿌리가 깨어나 스스로 상처를 돌보기 시작했으니까.',
    '카엘은 피난처의 우물을 고쳤다. 물에서 희미하게 뿌리의 노래가 들렸다.',
  ],
};

export const CREDITS = [
  '에코브라이어: 잔향의 뿌리',
  '',
  '기획 · 프로그래밍 · 픽셀아트 생성 코드 · 음악 합성',
  '— 에코브라이어 제작팀',
  '',
  '모든 그래픽은 코드와 데이터로 생성되었습니다.',
  '모든 음악과 효과음은 브라우저에서 실시간 합성됩니다.',
  '',
  '플레이해 주셔서 감사합니다.',
];

/** 현재 목표 문구 */
export function objectiveFor(flags: Record<string, number>): string {
  const f = (k: string) => !!flags[k];
  if (f('ending_seal') || f('ending_heal')) return '세계뿌리의 운명이 정해졌다';
  if (f('gate_open')) return '세계뿌리 심부의 가장 깊은 곳 — 최종 수호자';
  if (f('seal_storm')) return '피난처로 돌아가 뿌리문을 연다 (봉인 3/3)';
  if (f('seal_glass')) return '피난처 서쪽 부서진 고원 → 폭풍 성소 (봉인 2/3)';
  if (f('seal_ember')) return '피난처 북쪽 유리숲 → 유리 성소 (봉인 1/3)';
  if (f('orin_joined')) return '폐허 북쪽의 잿불 성소에서 첫 봉인을 되찾는다';
  if (f('sera_joined')) return '동쪽 잠긴 폐허로 향한다';
  if (f('tut2_done')) return '다리 건너 야영지를 살핀다';
  return '동쪽 재빛 초원의 오염을 조사한다';
}
