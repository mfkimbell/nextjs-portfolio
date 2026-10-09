const BASE_PATH = "M80 35 C48 37 31 63 34 96 C36 123 58 139 63 154 C68 170 49 188 55 220 C60 252 89 267 132 268 L866 268 C911 267 943 250 946 218 C949 189 931 173 938 153 C944 135 966 119 967 91 C968 58 942 35 904 33 Z";
const ROUND_PATH = "M92 35 C57 35 35 61 35 94 C35 124 42 143 42 162 C42 188 48 207 57 218 C63 249 91 265 132 268 L866 268 C907 265 937 249 943 218 C952 207 958 188 958 162 C958 143 965 124 965 94 C965 61 941 35 904 35 Z";

const JELLO_PATHS = [
  BASE_PATH,
  "M80 35 C47 36 30 63 34 96 C36 126 60 134 63 146 C66 158 56 177 55 220 C60 252 89 267 132 268 L866 268 C911 267 943 250 946 218 C950 188 925 181 932 164 C940 145 967 125 967 92 C968 58 942 35 904 33 Z",
  "M80 35 C50 37 33 61 34 94 C35 120 48 143 49 164 C50 186 51 202 55 220 C60 252 89 267 132 268 L866 268 C911 267 943 250 946 218 C948 193 941 181 944 169 C947 153 964 126 967 95 C970 59 942 35 904 33 Z",
  "M80 35 C46 39 29 66 35 99 C39 127 64 149 67 166 C69 181 47 195 55 220 C60 252 89 267 132 268 L866 268 C911 267 943 250 946 218 C949 189 944 169 946 151 C948 133 968 116 967 88 C966 57 941 35 904 33 Z",
] as const;

const NUMBER_PATTERN = /-?\d+(?:\.\d+)?/g;
const baseNumbers = BASE_PATH.match(NUMBER_PATTERN)?.map(Number) ?? [];

function interpolatePath(target: string, amount: number) {
  let index = 0;
  return target.replace(NUMBER_PATTERN, (match) => {
    const targetValue = Number(match);
    const baseValue = baseNumbers[index++] ?? targetValue;
    return String(baseValue + (targetValue - baseValue) * amount);
  });
}

export function getDialogueJelloPaths(flow: number, roundness: number, direction: number) {
  const amount = Math.max(0, Math.min(1, flow));
  const round = Math.max(0, Math.min(1, roundness));
  const paths = JELLO_PATHS.map((path) => {
    const moving = interpolatePath(path, amount);
    let index = 0;
    const movingNumbers = moving.match(NUMBER_PATTERN)?.map(Number) ?? [];
    return ROUND_PATH.replace(NUMBER_PATTERN, (match) => {
      const roundedValue = Number(match);
      const movingValue = movingNumbers[index++] ?? roundedValue;
      return String(movingValue + (roundedValue - movingValue) * round);
    });
  });
  return direction < 0 ? [paths[0], ...paths.slice(1).reverse()] : paths;
}
