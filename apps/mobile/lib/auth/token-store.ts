import * as SecureStore from "expo-secure-store";

/**
 * Where the phone keeps its refresh token.
 *
 * **SecureStore, not AsyncStorage.** AsyncStorage is a plaintext file in the
 * app's sandbox; SecureStore is the Keychain on iOS and an EncryptedSharedPrefs
 * blob backed by the Keystore on Android. A refresh token is a long-lived
 * credential and belongs in the second one.
 *
 * The ACCESS token is deliberately not here. It lives in memory for the same
 * reason it does in the SPA: it expires in fifteen minutes, writing it to disk
 * on every rotation buys nothing, and a value on disk is a value something else
 * can read. The refresh token is what survives a restart, and one round trip
 * turns it back into an access token.
 *
 * The web clients keep the refresh token in an httpOnly cookie instead, which a
 * phone has no equivalent of — and that is why `POST /auth/login` answers with
 * the refresh token in the JSON body as well as in a `Set-Cookie`. Each client
 * takes the half it can use.
 */
const REFRESH_KEY = "supplies.refreshToken";

export async function readRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_KEY);
  } catch {
    // A corrupt keystore entry, or a device where SecureStore is unavailable.
    // Treat it as "no session" rather than crashing the app on launch.
    return null;
  }
}

export async function writeRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_KEY, token, {
    /**
     * Readable only after the device has been unlocked once since boot, and
     * never restored to a different phone from a backup. The app is useless
     * without a network anyway, so nothing is lost by refusing to work on a
     * device that has not been unlocked.
     */
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function clearRefreshToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  } catch {
    // Nothing to delete, or the store is unavailable. Either way the caller is
    // signing out and an exception here would stop it doing so.
  }
}
