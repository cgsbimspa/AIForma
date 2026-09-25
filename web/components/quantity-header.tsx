"use client";
import { createContext } from 'react';
// The active desk renders its controls directly in the workspace header.
export const QuantityHeaderContext=createContext<HTMLElement|null>(null);
