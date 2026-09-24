"use client";

import { createContext } from "react";

// The assistant keeps ownership of its live Autodesk session; the header only
// supplies a destination for the status, without a second authentication poll.
export const HeaderStatusContext = createContext<HTMLDivElement | null>(null);
