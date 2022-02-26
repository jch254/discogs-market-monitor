export const sleep = (millis: number) => {
  return new Promise((resolve) => setTimeout(resolve, millis));
};