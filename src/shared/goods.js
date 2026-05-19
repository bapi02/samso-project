// Fragment type catalog + probability roll, shared by controller (popup) and
// screen (extract result write). Spec table:
//
//   Type  Prob.  Goods                              Rarity
//   A     50%    NEXIS 파편 캐리어 샤쉐             common
//   B     30%    NEXTIS LAB 스티커팩                uncommon
//   C     15%    NEXIS 파편 러기지택                rare
//   D      5%    NEXTIS LAB 스케일 스트랩           legendary

export const FRAGMENTS = {
  A: {
    id: 'A',
    weight: 50,
    rarity: 'common',
    label: 'A 등급',
    goods: 'NEXIS 파편 캐리어 샤쉐',
    color: '#9ccfff',
    accent: '#4dd0ff',
  },
  B: {
    id: 'B',
    weight: 30,
    rarity: 'uncommon',
    label: 'B 등급',
    goods: 'NEXTIS LAB 스티커팩',
    color: '#a4f0c2',
    accent: '#5ee090',
  },
  C: {
    id: 'C',
    weight: 15,
    rarity: 'rare',
    label: 'C 등급',
    goods: 'NEXIS 파편 러기지택',
    color: '#e0b8ff',
    accent: '#c97aff',
  },
  D: {
    id: 'D',
    weight: 5,
    rarity: 'legendary',
    label: 'D 등급',
    goods: 'NEXTIS LAB 스케일 스트랩',
    color: '#ffd06a',
    accent: '#ffaa1a',
  },
};

const FRAGMENT_LIST = Object.values(FRAGMENTS);
const TOTAL_WEIGHT = FRAGMENT_LIST.reduce((s, f) => s + f.weight, 0);

export function rollFragment() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const f of FRAGMENT_LIST) {
    r -= f.weight;
    if (r <= 0) return f;
  }
  return FRAGMENT_LIST[0];
}

export function getFragment(id) {
  return FRAGMENTS[id] || null;
}
