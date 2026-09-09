import { Stack } from "expo-router";

/**
 * A form sheet, not a custom modal. `presentation: "formSheet"` gives the
 * native animation, the grabber and drag-to-dismiss for free; the skill's
 * advice and the platform's, and a hand-rolled `<Modal>` would imitate all
 * three badly. Three screens share it, so it is one object rather than three
 * that drift.
 */
const SHEET = {
  // `as const` on the whole object would freeze the detents array too, and the
  // navigator's own type asks for a mutable `number[]`.
  presentation: "formSheet" as const,
  sheetGrabberVisible: true,
  sheetAllowedDetents: [0.6, 1],
  headerShown: false,
};

/**
 * The authed stack, and the tab bar is one screen inside it.
 *
 * Native headers rather than a hand-rolled one: the back gesture, the title
 * animation and the large-title behaviour are what make a screen feel like the
 * platform rather than like a website in a frame.
 *
 * **Detail screens push over the tab bar rather than inside a tab.** The
 * alternative — a stack per tab, using Expo Router's shared-group syntax so
 * `items/[id]` exists once and is instantiated three times — keeps the tabs
 * visible while drilling in, which is the iOS convention. It was not taken
 * because it needs every tab's root route to be a distinct filename and it
 * triples the route table for one screen that all three tabs open. If the iOS
 * pass in Phase 5 finds it matters, this is where the change goes, and the
 * screens themselves would not move.
 */
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#fbfbf9" },
        headerTitleStyle: { color: "#1a1c1a" },
        headerTintColor: "#297f48",
        headerShadowVisible: false,
        contentStyle: { backgroundColor: "#fbfbf9" },
      }}
    >
      {/* The tabs carry their own titles; a header above them would be a second one. */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="items/[id]/index" options={{ title: "" }} />
      <Stack.Screen name="items/[id]/edit" options={{ title: "Редагувати" }} />
      <Stack.Screen name="items/new" options={{ title: "Новий товар" }} />
      <Stack.Screen name="items/archive" options={{ title: "Архів" }} />
      <Stack.Screen name="status" options={{ title: "Стан" }} />
      {/*
        Full screen, not a sheet: a viewfinder wants the whole display, and a
        camera peeking out from behind a dimmed backdrop is a worse aim.
      */}
      <Stack.Screen
        name="scan"
        options={{ presentation: "fullScreenModal", headerShown: false }}
      />
      <Stack.Screen name="stock-write" options={SHEET} />
      <Stack.Screen name="shopping-check" options={SHEET} />
      <Stack.Screen name="shopping-row" options={SHEET} />
    </Stack>
  );
}
