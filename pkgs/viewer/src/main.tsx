import { serverAtom } from "./logic/server";
import { createStore, Provider } from "jotai";
import { followPlayhead } from "./logic/timeline/atoms";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./view/App";
import "./styles.css";

const store = createStore();
const unfollow = followPlayhead(store);
const untitle = store.sub(serverAtom, () => {
  const path = store.get(serverAtom)?.path;
  const name = path?.split(/[\\/]/).pop();
  document.title = name ? `${name} — Mekuru Movie Maker` : "Mekuru Movie Maker";
});
import.meta.hot?.dispose(() => {
  unfollow();
  untitle();
});

const root = document.getElementById("root");
if (!root) throw new Error("no #root element");
createRoot(root).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
