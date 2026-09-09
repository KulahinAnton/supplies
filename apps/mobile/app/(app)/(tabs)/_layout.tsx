import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useAttention } from "@/hooks/use-attention";

/**
 * The three places this app lives, as a **native** tab bar — a real
 * `BottomNavigationView` on Android and a `UITabBarController` on iOS, not a
 * row of `Pressable`s pretending to be one.
 *
 * The import says `unstable-native-tabs`, and that is a risk taken knowingly.
 * Expo's JS `Tabs` is stable and would work; it would also be the one part of
 * this app that is a web idea wearing a phone's clothes, and Phase 5's iOS
 * work wants the real control — tab-bar minimise behaviour, the iOS 26 bottom
 * accessory, and the platform's own press and haptics. The churn that "unstable"
 * warns about is confined to this file.
 *
 * **Four tabs, matching `AppNav` with one rename.** The fourth is labelled
 * «Ще» rather than «Налаштування»: it is the index for settings, sets and the
 * build status, and a tab label has room for one short word. «Рецепти» is not
 * a tab — it is Feature 32.1, off unless the household turned it on, and a
 * fifth tab that is usually absent is worse than a row inside this one.
 */
export default function TabsLayout() {
  const { expiring, restock } = useAttention();

  return (
    /**
     * `labelVisibilityMode="labeled"` is not decoration. Material's default is
     * `auto`, which drops every label but the selected one once a bar has four
     * items — so adding «Ще» silently unlabelled the other three, and a bar of
     * three anonymous glyphs is a worse tab bar than one with a word under
     * each. Android-only, and ignored elsewhere.
     */
    <NativeTabs labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf="square.grid.2x2" md="dashboard" />
        <NativeTabs.Trigger.Label>Огляд</NativeTabs.Trigger.Label>
        {/*
          The counts are the whole reason the nav carries badges on the web —
          the family should see from any screen that something is expiring.
          A zero is `hidden`, not "0": a badge reading nought is a decoration
          that trains people to stop looking at badges.
        */}
        <NativeTabs.Trigger.Badge hidden={expiring === 0}>
          {String(expiring)}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="items">
        <NativeTabs.Trigger.Icon sf="shippingbox" md="inventory_2" />
        <NativeTabs.Trigger.Label>Запаси</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="shopping">
        <NativeTabs.Trigger.Icon sf="cart" md="shopping_cart" />
        <NativeTabs.Trigger.Label>Покупки</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Badge hidden={restock === 0}>
          {String(restock)}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
        <NativeTabs.Trigger.Label>Ще</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
