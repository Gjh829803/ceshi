/** D01 躯干、颈部和头部的米制通行体积；翼尖/尾尖允许擦边。由 prepare-dragon-core-collision.mjs 生成。 */
export const CREATURE_COLLISION_PROBES:readonly {id:string;center:readonly [number,number,number];radius:number}[] = [
  {
    "id": "D01-core-0",
    "center": [
      -0.011,
      0.219,
      6.223
    ],
    "radius": 1.462
  },
  {
    "id": "D01-core-1",
    "center": [
      0.014,
      0.295,
      -0.26
    ],
    "radius": 1.442
  },
  {
    "id": "D01-core-2",
    "center": [
      0.007,
      2.384,
      3.721
    ],
    "radius": 1.71
  },
  {
    "id": "D01-core-3",
    "center": [
      -0.067,
      -0.835,
      3.442
    ],
    "radius": 1.48
  },
  {
    "id": "D01-core-4",
    "center": [
      0.133,
      -0.426,
      9.261
    ],
    "radius": 1.379
  },
  {
    "id": "D01-core-5",
    "center": [
      0.485,
      0.154,
      1.929
    ],
    "radius": 1.448
  },
  {
    "id": "D01-core-6",
    "center": [
      0.052,
      0.467,
      4.402
    ],
    "radius": 1.462
  },
  {
    "id": "D01-core-7",
    "center": [
      -0.018,
      -0.964,
      5.253
    ],
    "radius": 1.541
  },
  {
    "id": "D01-core-8",
    "center": [
      0.022,
      1.731,
      1.282
    ],
    "radius": 1.614
  },
  {
    "id": "D01-core-9",
    "center": [
      -0.184,
      0.622,
      2.832
    ],
    "radius": 1.543
  },
  {
    "id": "D01-core-10",
    "center": [
      -0.185,
      -0.271,
      1.194
    ],
    "radius": 1.509
  },
  {
    "id": "D01-core-11",
    "center": [
      -0.008,
      -0.519,
      7.514
    ],
    "radius": 1.636
  }
];
export const CREATURE_COLLISION_ENVELOPE = {
  "kind": "box",
  "halfExtents": [
    1.8299999999999998,
    3.2994999999999997,
    6.170999999999999
  ],
  "offset": [
    0.10299999999999998,
    0.7944999999999998,
    4.468999999999999
  ]
} as const;
