import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = '@Uberzap:session';

export const saveSession = async (data) => {
  try {
    const currentSession = await getSession() || {};
    const newSession = { ...currentSession, ...data };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
  } catch (error) {
    console.error('Error saving session:', error);
  }
};

export const getSession = async () => {
  try {
    const session = await AsyncStorage.getItem(SESSION_KEY);
    return session ? JSON.parse(session) : null;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
};

export const clearSession = async () => {
  try {
    await AsyncStorage.multiRemove([SESSION_KEY, 'driverId']);
  } catch (error) {
    console.error('Error clearing session:', error);
  }
};
