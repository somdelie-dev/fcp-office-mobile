import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "foreman_tutorial_completed_v1";

export async function isTutorialCompleted(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEY);
  return val === "true";
}

export async function setTutorialCompleted() {
  await AsyncStorage.setItem(KEY, "true");
}

export async function resetTutorial() {
  await AsyncStorage.removeItem(KEY);
}
