export type CheckItem = {
  id: string;
  label: string;
  done: boolean;
  order: number;
};

export type TaipeiEvent = {
  id: string;
  time: string;
  emoji: string;
  title: string;
  description: string;
  location: string;
  transit: string;
  tips: string;
  order: number;
  realOnly: boolean;
  checklist: CheckItem[];
};

export type TaipeiDay = {
  id: string;
  dayNum: number;
  date: string;
  label: string;
  focus: string;
  fakeFocus: string;
  notes: string;
  order: number;
  events: TaipeiEvent[];
};
