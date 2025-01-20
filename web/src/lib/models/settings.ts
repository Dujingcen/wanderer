import type { NotificationType } from "./notification";

export enum Language {
  en = "en",
  de = "de",
  es = "es",
  fr = "fr",
  hu = "hu",
  it = "it",
  nl = "nl",
  pl = "pl",
  pt = "pt",
  zh = "zh"
}

class Settings {
  id?: string;
  unit?: "metric" | "imperial";
  language?: Language;
  bio?: string;
  mapFocus?: "trails" | "location";
  location?: { name: string, lat: number, lon: number };
  category?: string;
  tilesets?: { name: string, url: string }[]
  terrain?: { terrain: string, hillshading: string };
  user?: string;
  privacy?: { account: "public" | "private", trails: "public" | "private", lists: "public" | "private" }
  notifications?: Record<NotificationType, { web: boolean, email: boolean }>

  constructor(
    unit: "metric" | "imperial",
    language: Language,
    mapFocus: "trails" | "location",
    user: string,
    params?: {
      location?: { name: string, lat: number, lon: number }
      category?: string
      tilesets?: { name: string, url: string }[]
      terrain?: { terrain: string, hillshading: string };
    }
  ) {
    this.unit = unit;
    this.language = language;
    this.mapFocus = mapFocus;
    this.user = user;
    this.location = params?.location;
    this.category = params?.category;
    this.tilesets = params?.tilesets ?? [];
    this.terrain = params?.terrain;
  }
}


export { Settings };
