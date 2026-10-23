// Character roster. A character is pure data: a palette plus a head feature.
// The sprite generator turns this into every animation frame, so adding a new
// mascot is one entry here — silhouette, proportions and timing stay consistent.

export type HeadFeature = "antenna" | "cat" | "bunny" | "sprout" | "twin" | "tuft" | "bow";

export interface Palette {
  outline: string;
  shadow: string;
  body: string;
  highlight: string;
  /** antenna bulb, bow, leaves… */
  accent: string;
  accentDark: string;
  cheek: string;
  eye: string;
  /** glow colour for the head feature / aura */
  glow: string;
}

export interface CharacterDef {
  id: string;
  name: string;
  feature: HeadFeature;
  palette: Palette;
  /** 1 = default blob; slightly wider/taller variants keep the family look */
  bodyW?: number;
  bodyH?: number;
}

const OUTLINE = "#1a0e08";

export const CHARACTERS: Record<string, CharacterDef> = {
  realm: {
    id: "realm",
    name: "REALM",
    feature: "antenna",
    palette: {
      outline: OUTLINE,
      shadow: "#d9601e",
      body: "#ff8a3d",
      highlight: "#ffc08f",
      accent: "#ffd36e",
      accentDark: "#e89a2c",
      cheek: "#ff5f4a",
      eye: OUTLINE,
      glow: "#ff6a00",
    },
  },
  biscuit: {
    id: "biscuit",
    name: "BISCUIT",
    feature: "cat",
    palette: {
      outline: OUTLINE,
      shadow: "#cfb48c",
      body: "#f3e3c3",
      highlight: "#fff7e6",
      accent: "#f59aa0",
      accentDark: "#c46f78",
      cheek: "#f59aa0",
      eye: OUTLINE,
      glow: "#ffe9b8",
    },
  },
  hop: {
    id: "hop",
    name: "HOP",
    feature: "bunny",
    palette: {
      outline: OUTLINE,
      shadow: "#d9a924",
      body: "#ffd84d",
      highlight: "#fff1a8",
      accent: "#ffb3a7",
      accentDark: "#d97c70",
      cheek: "#ff9a6b",
      eye: OUTLINE,
      glow: "#ffd84d",
    },
  },
  sprout: {
    id: "sprout",
    name: "SPROUT",
    feature: "sprout",
    palette: {
      outline: "#0e1a12",
      shadow: "#4fb38a",
      body: "#7fe0b4",
      highlight: "#c9f7e1",
      accent: "#3fbf5f",
      accentDark: "#23803d",
      cheek: "#ff9aa8",
      eye: "#0e1a12",
      glow: "#7fe0b4",
    },
  },
  sky: {
    id: "sky",
    name: "SKY",
    feature: "twin",
    palette: {
      outline: "#0a1020",
      shadow: "#4a8fd9",
      body: "#7fbfff",
      highlight: "#d2ebff",
      accent: "#ffffff",
      accentDark: "#9cc8f0",
      cheek: "#ff9ac0",
      eye: "#0a1020",
      glow: "#7fbfff",
    },
  },
  tuft: {
    id: "tuft",
    name: "TUFT",
    feature: "tuft",
    palette: {
      outline: "#140c1e",
      shadow: "#9a78d0",
      body: "#c6a6f5",
      highlight: "#ecdcff",
      accent: "#8a5fd0",
      accentDark: "#5e3a9c",
      cheek: "#ff9ac0",
      eye: "#140c1e",
      glow: "#c6a6f5",
    },
  },
  bow: {
    id: "bow",
    name: "BOW",
    feature: "bow",
    palette: {
      outline: "#1e0a12",
      shadow: "#e0709c",
      body: "#ffa3c4",
      highlight: "#ffe0ec",
      accent: "#ff3d7f",
      accentDark: "#b81f55",
      cheek: "#ff6a8a",
      eye: "#1e0a12",
      glow: "#ffa3c4",
    },
  },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS);
