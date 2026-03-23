import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import { HomeScreen } from "./screens/HomeScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { PodcastScreen } from "./screens/PodcastScreen";
import { QuizScreen } from "./screens/QuizScreen";

export type RootStackParamList = {
  Main: undefined;
  QuizSession: undefined;
};

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<RootStackParamList>();

function PlaceholderQuizTab() {
  return (
    <View style={{ flex: 1, backgroundColor: "#020617", padding: 16 }}>
      <Text style={{ color: "#e2e8f0" }}>Use the Home tab to launch today&apos;s session.</Text>
    </View>
  );
}

function MainTabs({ navigation }: { navigation: { navigate: (k: keyof RootStackParamList) => void } }) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#020617" },
        headerTintColor: "#e2e8f0",
        tabBarStyle: { backgroundColor: "#020617", borderTopColor: "#1e293b" },
        tabBarActiveTintColor: "#a5b4fc",
        tabBarInactiveTintColor: "#64748b",
      }}
    >
      <Tab.Screen name="Home">
        {() => <HomeScreen onStartQuiz={() => navigation.navigate("QuizSession")} />}
      </Tab.Screen>
      <Tab.Screen name="Quiz" component={PlaceholderQuizTab} />
      <Tab.Screen name="Podcast" component={PodcastScreen} />
      <Tab.Screen name="Library" component={LibraryScreen} />
    </Tab.Navigator>
  );
}

function RootStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Main" options={{ headerShown: false }}>
        {({ navigation }) => <MainTabs navigation={navigation} />}
      </Stack.Screen>
      <Stack.Screen name="QuizSession" options={{ title: "Quiz burst", headerStyle: { backgroundColor: "#020617" }, headerTintColor: "#e2e8f0" }}>
        {({ navigation }) => <QuizScreen onDone={() => navigation.goBack()} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

export default function App() {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <NavigationContainer>
        <RootStack />
      </NavigationContainer>
    </QueryClientProvider>
  );
}
