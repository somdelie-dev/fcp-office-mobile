import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "selected_site_v1";

export async function getSelectedSiteId(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export async function setSelectedSiteId(siteId: string) {
  await AsyncStorage.setItem(KEY, siteId);
}
