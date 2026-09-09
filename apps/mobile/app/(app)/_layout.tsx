import { Stack } from "expo-router";

/**
 * The authed stack. Native headers rather than a hand-rolled one: the back
 * gesture, the title animation and the large-title behaviour are what make a
 * screen feel like the platform rather than like a website in a frame.
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
      <Stack.Screen name="index" options={{ title: "Запаси" }} />
      <Stack.Screen name="items/[id]" options={{ title: "" }} />
      <Stack.Screen name="status" options={{ title: "Стан" }} />
      {/*
        A form sheet, not a custom modal. `presentation: "formSheet"` gives the
        native animation, the grabber and drag-to-dismiss for free; the skill's
        advice and the platform's, and a hand-rolled `<Modal>` would imitate
        all three badly.
      */}
      {/*
        Full screen, not a sheet: a viewfinder wants the whole display, and a
        camera peeking out from behind a dimmed backdrop is a worse aim.
      */}
      <Stack.Screen
        name="scan"
        options={{ presentation: "fullScreenModal", headerShown: false }}
      />
      <Stack.Screen
        name="stock-write"
        options={{
          presentation: "formSheet",
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.6, 1],
          headerShown: false,
        }}
      />
    </Stack>
  );
}
