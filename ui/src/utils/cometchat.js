import { CometChatUIKit, UIKitSettingsBuilder } from '@cometchat/chat-uikit-react';

const config = {
  appId: (import.meta.env.VITE_COMETCHAT_APP_ID ?? '').trim(),
  region: (import.meta.env.VITE_COMETCHAT_REGION ?? '').trim(),
  authKey: (import.meta.env.VITE_COMETCHAT_AUTH_KEY ?? '').trim(),
  uid: (import.meta.env.VITE_COMETCHAT_UID ?? '').trim(),
};

let initPromise = null;
let loginPromise = null;

function ensureInitialized() {
  if (!config.appId || !config.region || !config.authKey) {
    return Promise.reject(new Error('Missing CometChat configuration.'));
  }

  if (!initPromise) {
    const settings = new UIKitSettingsBuilder()
      .setAppId(config.appId)
      .setRegion(config.region)
      .setAuthKey(config.authKey)
      // .setAdminHost(`${config.appId}.api-${config.region}.cometchat-staging.com/v3.0`)
      // .setClientHost(`${config.appId}.apiclient-${config.region}.cometchat-staging.com/v3.0`)
      .subscribePresenceForAllUsers()
      .build();

    initPromise = CometChatUIKit.init(settings).catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
}

export function ensureLoggedIn() {
  return ensureInitialized().then(() =>
    CometChatUIKit.getLoggedinUser().then((user) => {
      if (user) {
        return user;
      }

      if (!config.uid) {
        throw new Error('CometChat UID missing. Update the .env file.');
      }

      if (!loginPromise) {
        loginPromise = CometChatUIKit.login(config.uid).catch((error) => {
          loginPromise = null;
          throw error;
        });
      }

      return loginPromise;
    }),
  );
}
