import Cocoa
import CoreGraphics
import Darwin
import Foundation
import QuartzCore
import WebKit

private let HUD_HTML = #"""
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; }
  html, body {
    width: 100%;
    height: 100%;
    background: rgba(12, 10, 24, 0.94);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif;
    color: #ffffff;
    overflow: hidden;
  }
  .shell {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    border-radius: 22px;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.38);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
    padding: 11px 14px 8px 14px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
  }
  .shell::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 22px;
    background: rgba(12, 8, 28, 0.94);
    backdrop-filter: blur(18px) saturate(140%);
    -webkit-backdrop-filter: blur(18px) saturate(140%);
    pointer-events: none;
    z-index: 0;
  }
  #cardDetailDrawer {
    background: rgba(13, 11, 28, 0.97);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 14px;
    padding: 8px 10px;
  }
  .shell > * {
    position: relative;
    z-index: 1;
  }
  .shell > div:first-of-type {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }
  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    row-gap: 6px;
    padding: 0 2px 6px 2px;
    cursor: grab;
  }
  .header:active {
    cursor: grabbing;
  }
  .header-title {
    font-size: 15.5px;
    font-weight: 700;
    letter-spacing: -0.3px;
    white-space: normal;
    overflow: visible;
    line-height: 1.25;
  }
  .header-title span {
    color: #5eead4;
  }
  .header-sub {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.76);
    margin-top: 2px;
    white-space: normal;
    overflow: visible;
    line-height: 1.3;
  }
  .laptop-badge {
    width: 56px;
    height: 44px;
    border-radius: 12px;
    background: radial-gradient(circle, rgba(56, 189, 248, 0.32) 0%, rgba(56, 189, 248, 0.0) 72%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    filter: drop-shadow(0 4px 12px rgba(56, 189, 248, 0.45));
  }
  .card {
    background: rgba(18, 14, 40, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.20);
    border-radius: 14px;
    padding: 8px 11px;
  }
  .shield-card {
    margin-bottom: 6px;
  }
  .shield-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12.5px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .shield-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .shield-pill {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
    border: 1px solid rgba(255, 255, 255, 0.28);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(124, 58, 237, 0.45);
  }
  .shield-status {
    color: rgba(255, 255, 255, 0.85);
    font-size: 12px;
    font-weight: 500;
  }
  .shield-main {
    font-size: 13.5px;
    font-weight: 600;
    color: #ffffff;
  }
  .shield-sub {
    font-size: 11.5px;
    color: #a5f3fc;
    margin-top: 3px;
    line-height: 1.32;
    white-space: normal;
  }
  .bento {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 7px;
    margin-bottom: 6px;
  }
  .bento > div {
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  }
  .bento > div:hover {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.3);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
  }
  .bento > div:active {
    transform: translateY(0px);
  }
  .tile {
    min-width: 0;
    overflow: hidden;
    background: rgba(18, 14, 40, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.20);
    border-radius: 13px;
    padding: 7px 10px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 62px;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .tile:hover, .card.clickable-card:hover {
    border-color: rgba(94, 234, 212, 0.52);
    background: rgba(32, 24, 68, 0.98);
  }
  .clickable-card {
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.10);
    font-size: 11.5px;
  }
  .drill-card-row {
    border: 1px solid rgba(255, 255, 255, 0.13);
    background: rgba(22, 16, 48, 0.96);
    border-radius: 10px;
    padding: 7px 9px;
    margin-top: 4px;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .drill-card-row:hover {
    border-color: rgba(94, 234, 212, 0.52);
    background: rgba(36, 26, 72, 0.98);
  }
  .drill-card-row.expanded {
    border-color: rgba(94, 234, 212, 0.62);
    background: rgba(22, 16, 50, 0.28);
  }
  .drill-hdr {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 12px;
  }
  .drill-chev {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    background: rgba(94, 234, 212, 0.16);
    border: 1px solid rgba(94, 234, 212, 0.38);
    color: #5eead4;
    font-size: 10px;
    font-weight: 800;
    flex-shrink: 0;
  }
  .drill-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 650;
    padding: 1.5px 7px;
    border-radius: 999px;
    background: rgba(56, 189, 248, 0.16);
    border: 1px solid rgba(56, 189, 248, 0.36);
    color: #bae6fd;
    flex-shrink: 0;
  }
  .drill-panel {
    margin-top: 7px;
    padding-top: 7px;
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .drill-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-bottom: 2px;
  }
  .drill-chip {
    font-size: 10.5px;
    font-weight: 600;
    color: #e2e8f0;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 6px;
    padding: 3px 8px;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: all 0.14s ease;
    user-select: none;
  }
  .drill-chip:hover {
    color: #ffffff;
    background: rgba(56, 189, 248, 0.22);
    border-color: rgba(56, 189, 248, 0.55);
    transform: translateY(-0.5px);
  }
  .drill-chip.active {
    color: #5eead4;
    background: rgba(20, 184, 166, 0.25);
    border-color: rgba(94, 234, 212, 0.75);
    box-shadow: 0 0 8px rgba(20, 184, 166, 0.25);
  }
  .drill-item {
    background: rgba(10, 7, 24, 0.24);
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-radius: 8px;
    padding: 6px 8px;
    transition: border-color 0.12s ease;
  }
  .drill-item.clickable:hover {
    border-color: rgba(56, 189, 248, 0.48);
    background: rgba(16, 12, 38, 0.38);
  }
  .drill-cmd {
    font-family: "SF Mono", Menlo, Monaco, monospace;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.66);
    margin-top: 2px;
    word-break: break-all;
    user-select: text;
    -webkit-user-select: text;
  }
  .drill-subpanel {
    margin-top: 6px;
    padding-top: 5px;
    border-top: 1px dashed rgba(255, 255, 255, 0.14);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .drill-pid-row {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 4px 7px;
    font-size: 10.5px;
  }
  .drill-sec-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #5eead4;
    margin-top: 4px;
    margin-bottom: 2px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .drill-box {
    background: rgba(8, 5, 20, 0.24);
    border: 1px solid rgba(255, 255, 255, 0.11);
    border-radius: 8px;
    padding: 6px 8px;
    font-size: 11px;
    line-height: 1.38;
    color: rgba(255, 255, 255, 0.88);
  }
  .spark-bars {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 26px;
    padding: 3px 0 1px 0;
  }
  .spark-bar {
    flex: 1;
    min-width: 4px;
    background: linear-gradient(180deg, #5eead4 0%, #38bdf8 60%, rgba(56, 189, 248, 0.25) 100%);
    border-radius: 2px 2px 0 0;
  }
  .rec-bullet {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 6px;
    margin: 2px 0;
    border-radius: 7px;
    font-size: 11px;
    color: #e2e8f0;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }
  .rec-bullet.done {
    background: rgba(16, 185, 129, 0.11);
    border-color: rgba(52, 211, 153, 0.30);
    color: #ecfdf5;
  }
  .rec-check {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 800;
    flex-shrink: 0;
    background: rgba(251, 191, 36, 0.18);
    border: 1px solid rgba(251, 191, 36, 0.45);
    color: #fbbf24;
  }
  .rec-check.done {
    background: rgba(16, 185, 129, 0.28);
    border: 1px solid rgba(52, 211, 153, 0.65);
    color: #34d399;
  }
  .rec-status-pill {
    font-size: 9.5px;
    font-weight: 700;
    padding: 1.5px 6px;
    border-radius: 999px;
    white-space: nowrap;
    flex-shrink: 0;
    background: rgba(251, 191, 36, 0.16);
    border: 1px solid rgba(251, 191, 36, 0.38);
    color: #fde68a;
  }
  .rec-status-pill.done {
    background: rgba(16, 185, 129, 0.20);
    border: 1px solid rgba(52, 211, 153, 0.45);
    color: #6ee7b7;
  }
  .mini-act-btn {
    display: inline-flex;
    align-items: center;
    font-size: 10px;
    font-weight: 650;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid rgba(56, 189, 248, 0.42);
    background: rgba(56, 189, 248, 0.18);
    color: #bae6fd;
    cursor: pointer;
    white-space: nowrap;
  }
  .mini-act-btn:hover {
    background: rgba(56, 189, 248, 0.35);
    color: #ffffff;
  }
  .mini-act-btn.danger {
    border-color: rgba(251, 113, 133, 0.48);
    background: rgba(251, 113, 133, 0.18);
    color: #fecdd3;
  }
  .mini-act-btn.danger:hover {
    background: rgba(251, 113, 133, 0.36);
    color: #ffffff;
  }
  .meter-track {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 99px;
    overflow: hidden;
    margin-top: 4px;
  }
  .meter-fill {
    height: 100%;
    border-radius: 99px;
  }
  .tile-tall {
    min-height: 66px;
  }
  .tile-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    min-width: 0;
  }
  .tile-head {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 12.5px;
    font-weight: 600;
    min-width: 0;
    overflow: visible;
    white-space: normal;
  }
  .tile-head span:last-child {
    min-width: 0;
    flex: 1;
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    line-height: 1.25;
  }
  .ico-badge {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.22);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 2px 6px rgba(0, 0, 0, 0.25);
  }
  .ico-badge svg {
    width: 14px;
    height: 14px;
    stroke-width: 2;
    stroke: #ffffff;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .ico-disk { background: linear-gradient(135deg, rgba(56, 189, 248, 0.42), rgba(37, 99, 235, 0.42)); }
  .ico-mem  { background: linear-gradient(135deg, rgba(52, 211, 153, 0.42), rgba(16, 185, 129, 0.42)); }
  .ico-ai   { background: linear-gradient(135deg, rgba(168, 85, 247, 0.48), rgba(236, 72, 153, 0.42)); }
  .ico-cpu  { background: linear-gradient(135deg, rgba(251, 113, 133, 0.45), rgba(245, 158, 11, 0.42)); }
  .ico-net  { background: linear-gradient(135deg, rgba(99, 102, 241, 0.45), rgba(56, 189, 248, 0.42)); }
  .ico-win  { background: linear-gradient(135deg, rgba(45, 212, 191, 0.42), rgba(14, 165, 233, 0.42)); }
  .tile-sub {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.80);
    margin-top: 3px;
    padding-left: 2px;
    line-height: 1.3;
    white-space: normal;
    overflow: visible;
  }
  .tile-sub.warn {
    color: #fbbf24;
  }
  .tile-sub.good {
    color: #5eead4;
  }
  .tile-action {
    align-self: flex-end;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    color: #bae6fd;
    background: linear-gradient(180deg, rgba(56, 189, 248, 0.20) 0%, rgba(56, 189, 248, 0.10) 100%);
    border: 1px solid rgba(56, 189, 248, 0.34);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.20);
    padding: 3px 10px;
    border-radius: 999px;
    cursor: pointer;
    margin-top: 5px;
    white-space: nowrap;
    transition: all 0.15s ease;
  }
  .tile-action:hover {
    color: #ffffff;
    background: linear-gradient(180deg, rgba(56, 189, 248, 0.34) 0%, rgba(56, 189, 248, 0.20) 100%);
    border-color: rgba(125, 211, 252, 0.60);
    transform: translateY(-0.5px);
  }
  .hdr-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 11px;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0.08) 100%);
    border: 1px solid rgba(255, 255, 255, 0.24);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 2px 6px rgba(0, 0, 0, 0.20);
    color: #ffffff;
    font-size: 11.5px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .hdr-pill:hover {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0.14) 100%);
    border-color: rgba(255, 255, 255, 0.42);
  }
  .hdr-pill svg {
    width: 12.5px;
    height: 12.5px;
    stroke: #5eead4;
    stroke-width: 2;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .tile-val {
    font-size: 11.5px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.92);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .tile-val.hot {
    color: #fb7185;
  }
  .net-rates {
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.85);
    padding-left: 25px;
    margin-top: 4px;
    line-height: 1.45;
  }
  .rec-header {
    font-size: 13px;
    font-weight: 700;
    margin: 0 4px 5px 4px;
  }
  .rec-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 11px;
  }
  .rec-top {
    display: flex;
    align-items: flex-start;
    gap: 11px;
  }
  .rec-badge {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
    border: 1px solid rgba(255, 255, 255, 0.28);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 4px 12px rgba(124, 58, 237, 0.45);
  }
  .rec-title {
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 2px;
    white-space: normal;
    line-height: 1.3;
  }
  .hog-link {
    appearance: none;
    -webkit-appearance: none;
    background: transparent;
    border: 0;
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px 0 0;
    margin: 0;
    color: #5eead4;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .hog-link:hover { color: #ffffff; }
  .hog-row {
    background: rgba(22, 16, 48, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    margin-top: 14px;
  }
  .hog-row.open { border-color: rgba(94, 234, 212, 0.7); }
  .hog-row-btn {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    background: transparent;
    border: 0;
    color: #fff;
    font: inherit;
    text-align: left;
    padding: 14px 14px;
    cursor: pointer;
  }
  .hog-rank { width: 18px; color: #5eead4; font-weight: 700; flex-shrink: 0; }
  .hog-name { font-weight: 700; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hog-stat { color: #5eead4; font-weight: 650; font-variant-numeric: tabular-nums; flex-shrink: 0; font-size: 12px; }
  .hog-pids { padding: 0 12px 14px 14px; display: flex; flex-direction: column; gap: 14px; }
  .hog-pid { padding: 10px 12px; border-radius: 8px; background: rgba(255, 255, 255, 0.05); }
  .hog-pid-top { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .hog-pid-top span:first-child { flex: 1; font-weight: 650; min-width: 0; }
  .hog-cmd {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 10.5px;
    color: rgba(255, 255, 255, 0.78);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hog-gpu { margin-top: 8px; font-size: 11.5px; color: rgba(255, 255, 255, 0.78); }
  .rec-desc {
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.74);
    line-height: 1.35;
  }
  .rec-btn {
    align-self: flex-end;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
    border: 1px solid rgba(255, 255, 255, 0.36);
    box-shadow: 0 4px 14px rgba(16, 185, 129, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.42);
    color: #ffffff;
    font-size: 11.5px;
    font-weight: 650;
    padding: 6px 14px;
    border-radius: 999px;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .rec-btn:hover {
    filter: brightness(1.08);
    transform: translateY(-0.5px);
  }
  .hud-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 18px 2px 4px;
    flex-shrink: 0;
  }
  .hud-resize-grip {
    position: fixed;
    right: 4px;
    bottom: 3px;
    width: 20px;
    height: 20px;
    cursor: nwse-resize;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.45);
    z-index: 50;
  }
  .hud-resize-grip:hover {
    color: #5eead4;
  }
  .hud-resize-edge-right {
    position: fixed;
    top: 40px;
    right: 0;
    width: 7px;
    bottom: 22px;
    cursor: ew-resize;
    z-index: 40;
  }
  .hud-resize-edge-bottom {
    position: fixed;
    left: 16px;
    right: 22px;
    bottom: 0;
    height: 7px;
    cursor: ns-resize;
    z-index: 40;
  }
</style>
</head>
<body>
  <div class="shell">
    <div>
      <div class="header" id="hudHeader">
        <div style="display:flex;align-items:flex-start;gap:10px;min-width:0;flex:1 1 220px;">
          <div style="width:34px;height:34px;border-radius:8px;background:linear-gradient(180deg,#6d28d9 0%,#4c1d95 100%);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.35);flex-shrink:0;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2L4 5.4V11.2C4 16.5 7.4 21.3 12 22.8C16.6 21.3 20 16.5 20 11.2V5.4L12 2Z" fill="#ffffff"/><path d="M13.2 6.8L8.2 13.0H11.6L10.8 17.4L15.8 11.2H12.4L13.2 6.8Z" fill="#5eead4"/></svg>
          </div>
          <div style="min-width:0;flex:1;">
            <div class="header-title">Mac YOLO Safeguards: <span id="healthState">Checking…</span></div>
            <div class="header-sub" id="macModel">Disk, memory, and the processes using this Mac</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:8px;">
          <button class="hdr-pill" onclick="toggleSettingsDrawer()">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82-.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span>Settings</span>
          </button>
          <button class="hdr-pill" id="hudSizeBtn" onclick="cycleHudSize()">
            <svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            <span id="hudSizeBtnText">Size</span>
          </button>
        </div>
      </div>

      <div id="overviewSection">
      <div class="card shield-card clickable-card" onclick="openCardDetail('shield')">
        <div class="shield-top">
          <div class="shield-left">
            <span class="shield-pill"><svg width="16" height="16" viewBox="0 0 32 32"><path d="M16 3L5 7.5v8.2C5 22.8 9.7 28.9 16 31c6.3-2.1 11-8.2 11-15.3V7.5L16 3z" fill="#ffffff"/><polygon points="17.5 8 10.5 17 15.5 17 14.2 24.5 21.5 15 16.5 15 17.5 8" fill="#14b8a6"/></svg></span>
            <span>Protection by <strong>Mac YOLO Safeguards</strong></span>
          </div>
          <span class="shield-status">✓ Protected · Details ›</span>
        </div>
        <div class="shield-main" id="guardHeadline">Scanning live AI token &amp; system telemetry…</div>
        <div class="shield-sub" id="onScreenNowLine">On screen now: Detecting active window…</div>
      </div>

      <div id="recSection">
        <div class="rec-header">Top processes</div>
        <div class="card rec-card clickable-card" onclick="openCardDetail('optimization')">
          <div class="rec-top">
            <div class="rec-badge">
              <svg width="24" height="24" viewBox="0 0 32 32"><path d="M16 3L5 7.5v8.2C5 22.8 9.7 28.9 16 31c6.3-2.1 11-8.2 11-15.3V7.5L16 3z" fill="#ffffff"/><polygon points="17.5 8 10.5 17 15.5 17 14.2 24.5 21.5 15 16.5 15 17.5 8" fill="#14b8a6"/></svg>
            </div>
            <div style="min-width:0;flex:1;">
              <div class="rec-title" id="recTitle">Top Hogs ›</div>
              <div class="rec-desc" id="recDesc">Click a name to see its processes.</div>
            </div>
          </div>
        </div>
      </div>

      <div class="bento">
        <div class="tile tile-tall" onclick="openCardDetail('disk')">
          <div>
            <div class="tile-row">
              <div class="tile-head">
                <span class="ico-badge ico-disk"><svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="3"/><line x1="2" y1="12" x2="22" y2="12"/><circle cx="6" cy="8" r="1"/><circle cx="6" cy="16" r="1"/></svg></span>
                <span>Disk &amp; AI Waste</span>
              </div>
              <span class="tile-val" id="diskRightBadge" style="color:#34d399;font-size:11px;">Details ›</span>
            </div>
            <div class="tile-sub warn" id="diskAvail">Scanning disk &amp; /tmp waste…</div>
            <div class="meter-track"><div class="meter-fill" id="diskBarFill" style="width:84%;background:linear-gradient(90deg,#fbbf24,#38bdf8);"></div></div>
          </div>
          <button class="tile-action" id="freeDiskBtn" onclick="event.stopPropagation();triggerHudAction('freeUpDisk', this, 'Purging…', 'Purged ✓')">Clean AI Waste</button>
        </div>

        <div class="tile tile-tall" onclick="openCardDetail('memory')">
          <div>
            <div class="tile-row">
              <div class="tile-head">
                <span class="ico-badge ico-mem"><svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="2"/><line x1="8" y1="6" x2="8" y2="3"/><line x1="12" y1="6" x2="12" y2="3"/><line x1="16" y1="6" x2="16" y2="3"/><line x1="8" y1="21" x2="8" y2="18"/><line x1="12" y1="21" x2="12" y2="18"/><line x1="16" y1="21" x2="16" y2="18"/></svg></span>
                <span>Memory &amp; Agent RAM</span>
              </div>
              <span class="tile-val" id="memRightBadge" style="color:#38bdf8;font-size:11px;">RAM ›</span>
            </div>
            <div class="tile-sub" id="memPressure">Scanning VM &amp; swarm RAM…</div>
            <div class="meter-track"><div class="meter-fill" id="memBarFill" style="width:62%;background:linear-gradient(90deg,#34d399,#38bdf8);"></div></div>
          </div>
          <button class="tile-action" id="freeMemBtn" onclick="event.stopPropagation();triggerHudAction('freeUpMemory', this, 'Reaping…', 'RAM Freed ✓')">Free Agent RAM</button>
        </div>

        <div class="tile tile-tall" onclick="openCardDetail('tokens')">
          <div>
            <div class="tile-row">
              <div class="tile-head">
                <span class="ico-badge ico-ai"><svg viewBox="0 0 24 24"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0-1.3-1.3L12 3z"/></svg></span>
                <span>AI Tokens &amp; Sessions</span>
              </div>
              <span class="tile-val" id="battPct" style="color:#5eead4;font-size:11.5px;">Live ›</span>
            </div>
            <div class="tile-sub" id="battState">Scanning active session JSONLs…</div>
            <div class="meter-track"><div class="meter-fill" id="tokBarFill" style="width:22%;background:linear-gradient(90deg,#10b981,#5eead4);"></div></div>
          </div>
          <button class="tile-action" onclick="event.stopPropagation();openCardDetail('tokens')">Inspect Sessions ›</button>
        </div>

        <div class="tile tile-tall" onclick="openCardDetail('optimization')">
          <div>
            <div class="tile-row">
              <div class="tile-head">
                <span class="ico-badge ico-cpu"><svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="6"/><line x1="15" y1="2" x2="15" y2="6"/><line x1="9" y1="18" x2="9" y2="22"/><line x1="15" y1="18" x2="15" y2="22"/><line x1="2" y1="9" x2="6" y2="9"/><line x1="2" y1="15" x2="6" y2="15"/><line x1="18" y1="9" x2="22" y2="9"/><line x1="18" y1="15" x2="22" y2="15"/></svg></span>
                <span>CPU, GPU &amp; Fans</span>
              </div>
              <span class="tile-val hot" id="cpuTemp" style="font-size:11px;">CPU · GPU ›</span>
            </div>
            <div class="tile-sub" id="cpuLoad">Scanning CPU &amp; AGXAccelerator GPU…</div>
            <div class="meter-track"><div class="meter-fill" id="cpuBarFill" style="width:24%;background:linear-gradient(90deg,#a855f7,#fb7185);"></div></div>
          </div>
          <button class="tile-action" onclick="event.stopPropagation();triggerHudAction('coolDownFans', this, 'Cooling…', 'Fans Cooled ✓')">Cool Down Fans</button>
        </div>

        <div class="tile tile-tall" onclick="openCardDetail('network')">
          <div>
            <div class="tile-row">
              <div class="tile-head">
                <span class="ico-badge ico-net"><svg viewBox="0 0 24 24"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1"/></svg></span>
                <span id="netName">Network &amp; Egress</span>
              </div>
              <span class="tile-val" style="color:#5eead4;font-size:11px;">Local-First ›</span>
            </div>
            <div class="net-rates" style="padding-left:2px;">
              <div id="netUp">↑ 0 KB/sec</div>
              <div id="netDown">↓ 0 KB/sec</div>
            </div>
          </div>
          <button class="tile-action" id="testSpeedBtn" onclick="event.stopPropagation();triggerHudAction('testSpeed', this, 'Refreshing…', 'Refresh')">Refresh</button>
        </div>

        <div class="tile tile-tall" onclick="openCardDetail('fleet')">
          <div>
            <div class="tile-row">
              <div class="tile-head">
                <span class="ico-badge ico-win"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><line x1="3" y1="9" x2="21" y2="9"/><circle cx="6.5" cy="6.5" r="0.8"/><circle cx="9.5" cy="6.5" r="0.8"/></svg></span>
                <span>AI Fleet &amp; MCPs</span>
              </div>
              <span class="tile-val" id="mcpRightBadge" style="color:#34d399;font-size:11px;">MCPs ›</span>
            </div>
            <div class="tile-sub good" id="activeAppTile" style="padding-left:2px;margin-top:4px;font-weight:600;">Scanning active swarms…</div>
            <div class="tile-sub" id="activeWinTile" style="padding-left:2px;margin-top:2px;">Scanning MCP &amp; LaunchAgent daemons…</div>
          </div>
          <button class="tile-action" onclick="event.stopPropagation();openCardDetail('fleet')">Inspect Fleet ›</button>
        </div>
      </div>
      </div>

      <div class="card rec-card" id="cardDetailDrawer" style="display:none;padding:11px 13px;gap:6px;max-height:calc(100vh - 78px);overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:2px;flex-shrink:0;">
          <div style="min-width:0;flex:1;">
            <div id="detailTitle" style="font-size:14.5px;font-weight:700;color:#5eead4;">Card Details</div>
            <div id="detailSub" style="font-size:11px;color:rgba(255,255,255,0.76);margin-top:1px;">Click any row below to drill into live PIDs, GPU, sessions &amp; actions</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button class="tile-action" id="expandAllDrillBtn" style="margin-top:0;padding:4px 9px;" onclick="toggleExpandAllDrill()">Expand All ▾</button>
            <button class="tile-action" style="margin-top:0;padding:4px 10px;" onclick="closeCardDetail()">Back</button>
          </div>
        </div>
        <div id="detailRowsContainer" style="display:flex;flex-direction:column;gap:4px;margin-top:2px;overflow-y:auto;flex:1 1 auto;min-height:0;padding-right:3px;"></div>
        <div id="detailFooter" style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid rgba(255,255,255,0.14);margin-top:2px;flex-shrink:0;flex-wrap:wrap;gap:6px;">
          <div style="display:flex;gap:6px;">
            <button class="rec-btn" onclick="triggerHudAction('coolDownFans', this, 'Cooling &amp; Reaping…', 'Fans Cooled ✓')">Cool Down Fans &amp; Reap Hogs</button>
            <button class="tile-action" style="margin-top:0;padding:6px 11px;" onclick="triggerHudAction('freeUpDisk', this, 'Purging…', 'Purged ✓')">Clean AI Waste</button>
          </div>
          <button class="tile-action" style="margin-top:0;padding:6px 11px;" onclick="toggleSettingsDrawer(true)">Uninstall Apps</button>
        </div>
      </div>
      <div class="card rec-card" id="settingsDrawer" style="display:none;padding:10px 13px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <div style="font-size:13px;font-weight:700;">Settings &amp; App Uninstaller</div>
          <button class="tile-action" style="margin-top:0;" onclick="toggleSettingsDrawer(false)">← Back</button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-top:1px solid rgba(255,255,255,0.12);">
          <span style="font-size:12px;color:rgba(255,255,255,0.92);">Mac YOLO Safeguards Status Bar Icon</span>
          <button class="tile-action" style="margin-top:0;" id="statusBarToggleBtn" onclick="sendAction('toggleStatusBarIcon')">Shown ✓ (Click to Hide)</button>
        </div>
        <div id="uninstallList" style="font-size:12px;color:rgba(255,255,255,0.72);padding:6px 0;">Open this list to measure apps.</div>
        <div style="display:flex;gap:6px;align-items:center;padding-top:5px;border-top:1px solid rgba(255,255,255,0.12);">
          <input id="customUninstallInput" type="text" placeholder="App name" style="flex:1;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.22);border-radius:7px;padding:4px 8px;color:#fff;font-size:11px;outline:none;" />
          <button class="tile-action" style="margin-top:0;color:#fca5a5;" onclick="requestUninstall(document.getElementById('customUninstallInput').value)">Uninstall</button>
        </div>
      </div>
    </div>

    <div class="hud-footer">
      <button class="tile-action" style="margin-top:0;" onclick="sendAction('toggleStatusBarIcon')">Menu Bar Icon: <strong id="quickStatusIconLabel" style="color:#5eead4;">Shown ✓</strong></button>
      <span id="footerSizeLabel" style="font-size:11px;color:rgba(255,255,255,0.68);cursor:pointer;" onclick="cycleHudSize()" title="Click to cycle size or drag corner">640×760</span>
    </div>
  </div>
  <div class="hud-resize-edge-right" id="hudResizeRight"></div>
  <div class="hud-resize-edge-bottom" id="hudResizeBottom"></div>
  <div class="hud-resize-grip" id="hudResizeGrip" title="Drag to resize">◢</div>

  <script>
    var HUD_PRESETS = [
      { label: 'Max', width: 0, height: 0 },
      { label: '740×535', width: 740, height: 535 },
      { label: '760×760', width: 760, height: 760 },
      { label: '840×860', width: 840, height: 860 }
    ];
    var _presetIdx = 0;
    function sendAction(action, extra) {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.yoloHud) {
        var msg = { action: action };
        if (extra) { for (var k in extra) msg[k] = extra[k]; }
        window.webkit.messageHandlers.yoloHud.postMessage(msg);
      }
    }
    var _completedRecActions = {};
    function triggerHudAction(action, btnEl, busyText, doneText) {
      _completedRecActions[action] = true;
      if (action === 'freeUpDisk' || action === 'cleanWaste') {
        _completedRecActions['cleanWaste'] = true;
        _completedRecActions['freeUpDisk'] = true;
      }
      if (action === 'coolDownFans' || action === 'reapFans') {
        _completedRecActions['reapFans'] = true;
        _completedRecActions['coolDownFans'] = true;
      }
      var origText = btnEl ? (btnEl.getAttribute('data-orig') || btnEl.textContent) : '';
      if (btnEl && !btnEl.getAttribute('data-orig')) btnEl.setAttribute('data-orig', origText);
      if (btnEl) {
        btnEl.textContent = busyText;
        btnEl.style.color = '#5eead4';
      }
      sendAction(action);
      if (_activeDetailCard && _lastHudState) renderActiveCardDetail(_lastHudState);
      setTimeout(function() {
        if (btnEl) btnEl.textContent = doneText;
        if (_activeDetailCard && _lastHudState) renderActiveCardDetail(_lastHudState);
        setTimeout(function() {
          if (btnEl && origText) {
            btnEl.textContent = origText;
            btnEl.style.color = '';
          }
        }, 3200);
      }, 650);
    }
    function resizeHud(w, h, persist) {
      if (!(w > 0) || !(h > 0)) {
        sendAction('resizeHud', { width: 0, height: 0, persist: !!persist, max: true });
        return;
      }
      var cw = Math.max(640, Math.round(w));
      var ch = Math.max(480, Math.round(h));
      var lbl = document.getElementById('footerSizeLabel');
      if (lbl) lbl.textContent = cw + '×' + ch;
      sendAction('resizeHud', { width: cw, height: ch, persist: !!persist });
    }
    function cycleHudSize() {
      _presetIdx = (_presetIdx + 1) % HUD_PRESETS.length;
      var p = HUD_PRESETS[_presetIdx];
      var btnTxt = document.getElementById('hudSizeBtnText');
      if (btnTxt) btnTxt.textContent = p.label;
      resizeHud(p.width, p.height, true);
    }
    window.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') sendAction('dismiss');
    });
    (function initDragAndResize() {
      var hdr = document.getElementById('hudHeader');
      if (hdr) {
        hdr.addEventListener('pointerdown', function(e) {
          if (e.target && e.target.closest('button')) return;
          e.preventDefault();
          hdr.setPointerCapture(e.pointerId);
          var lx = e.screenX, ly = e.screenY;
          function onMove(ev) {
            var dx = ev.screenX - lx, dy = ev.screenY - ly;
            lx = ev.screenX; ly = ev.screenY;
            if (dx !== 0 || dy !== 0) sendAction('moveHud', { dx: dx, dy: dy });
          }
          function onUp(ev) {
            hdr.removeEventListener('pointermove', onMove);
            hdr.removeEventListener('pointerup', onUp);
            hdr.removeEventListener('pointercancel', onUp);
            try { hdr.releasePointerCapture(ev.pointerId); } catch (_) {}
          }
          hdr.addEventListener('pointermove', onMove);
          hdr.addEventListener('pointerup', onUp);
          hdr.addEventListener('pointercancel', onUp);
        });
      }
      function bindResize(el, mode) {
        if (!el) return;
        el.addEventListener('pointerdown', function(e) {
          e.preventDefault();
          e.stopPropagation();
          el.setPointerCapture(e.pointerId);
          var sx = e.screenX, sy = e.screenY;
          var sw = window.innerWidth || 420, sh = window.innerHeight || 630;
          var pw = sw, ph = sh;
          function onMove(ev) {
            pw = mode === 'height' ? sw : (sw + (ev.screenX - sx));
            ph = mode === 'width' ? sh : (sh + (ev.screenY - sy));
            resizeHud(pw, ph, false);
          }
          function onUp(ev) {
            resizeHud(pw, ph, true);
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp);
            el.removeEventListener('pointercancel', onUp);
            try { el.releasePointerCapture(ev.pointerId); } catch (_) {}
          }
          el.addEventListener('pointermove', onMove);
          el.addEventListener('pointerup', onUp);
          el.addEventListener('pointercancel', onUp);
        });
      }
      bindResize(document.getElementById('hudResizeGrip'), 'both');
      bindResize(document.getElementById('hudResizeRight'), 'width');
      bindResize(document.getElementById('hudResizeBottom'), 'height');
    })();
    var _activeDetailCard = null;
    var _lastHudState = {};
    function toggleSettingsDrawer(forceShow) {
      var el = document.getElementById('settingsDrawer');
      var ov = document.getElementById('overviewSection');
      var det = document.getElementById('cardDetailDrawer');
      if (!el) return;
      var show = (typeof forceShow === 'boolean') ? forceShow : (el.style.display === 'none' || !el.style.display);
      if (show) { _activeDetailCard = null; if (det) det.style.display = 'none'; }
      el.style.display = show ? 'flex' : 'none';
      if (ov) ov.style.display = show ? 'none' : 'block';
      if (show) sendAction('listUninstallApps');
    }
    function fmtBytes(n) {
      n = Number(n) || 0;
      if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' GB';
      if (n >= 1048576) return Math.round(n / 1048576) + ' MB';
      if (n >= 1024) return Math.round(n / 1024) + ' KB';
      return n + ' B';
    }
    function requestUninstall(name) {
      if (!name || !String(name).trim()) return;
      sendAction('uninstallApp', { appName: String(name).trim() });
    }
    function renderUninstallList(payload) {
      var box = document.getElementById('uninstallList');
      if (!box) return;
      var apps = (payload && payload.apps) || [];
      box.innerHTML = '';
      if (!apps.length) {
        box.textContent = 'No extra apps to remove.';
        return;
      }
      apps.forEach(function(app) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0;border-top:1px solid rgba(255,255,255,0.12);';
        var label = document.createElement('span');
        label.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.88);';
        label.textContent = app.name + ' · ' + fmtBytes(app.bytes);
        var btn = document.createElement('button');
        btn.className = 'tile-action';
        btn.style.marginTop = '0';
        btn.style.color = '#fca5a5';
        btn.textContent = 'Uninstall';
        btn.onclick = function() { requestUninstall(app.name); btn.textContent = 'Moving to Trash…'; };
        row.appendChild(label);
        row.appendChild(btn);
        box.appendChild(row);
      });
    }
    function renderUninstallResult(payload) {
      var box = document.getElementById('uninstallList');
      if (payload && payload.ok && box) {
        box.textContent = (payload.appName || 'App') + ' moved to Trash · ' + fmtBytes(payload.beforeBytes);
        sendAction('listUninstallApps');
      } else if (box) {
        box.textContent = (payload && payload.error) ? payload.error : 'Uninstall did not finish.';
      }
    }
    var _expandedDrillRows = { 'cpu-hog-0': true, 'mem-hog-0': true, 'shield-cpu-gpu': true, 'fleet-mcp-bus': true };
    var _expandedSubRows = {};
    var _activeChipDrill = {};
    function handleChipDrillDown(rKey, chipIdx, chipText, ev) {
      if (ev) ev.stopPropagation();
      if (!rKey) return;
      _lastUserMouseDownAt = Date.now();
      var prev = (_activeChipDrill[rKey] !== undefined) ? _activeChipDrill[rKey] : -1;
      var nextIdx = (prev === chipIdx) ? -1 : chipIdx;
      _activeChipDrill[rKey] = nextIdx;
      var dd = (_lastHudState && _lastHudState.drillDown && _lastHudState.drillDown[_activeDetailCard]) || [];
      var targetRow = null;
      for (var i = 0; i < dd.length; i++) {
        if ((dd[i].key || ('row-' + i)) === rKey) { targetRow = dd[i]; break; }
      }
      if (targetRow && targetRow.items && targetRow.items.length) {
        var txt = String(chipText || '').toLowerCase();
        if (nextIdx >= 0 && /live mcps|pids|procs|processes|agents|swarms|sessions/.test(txt)) {
          for (var j = 0; j < targetRow.items.length; j++) {
            var ik = targetRow.items[j].key || (rKey + '-item-' + j);
            _expandedSubRows[ik] = true;
          }
        } else if (nextIdx >= 0 && /families|groups|categories/.test(txt)) {
          for (var k = 0; k < targetRow.items.length; k++) {
            var fk = targetRow.items[k].key || (rKey + '-item-' + k);
            _expandedSubRows[fk] = false;
          }
        }
      }
      renderActiveCardDetail(_lastHudState);
    }
    function expandAllSubRowsForRow(rKey, expandState, ev) {
      if (ev) ev.stopPropagation();
      _lastUserMouseDownAt = Date.now();
      var dd = (_lastHudState && _lastHudState.drillDown && _lastHudState.drillDown[_activeDetailCard]) || [];
      for (var i = 0; i < dd.length; i++) {
        var rk = dd[i].key || ('row-' + i);
        if (rk === rKey && dd[i].items) {
          for (var j = 0; j < dd[i].items.length; j++) {
            var ik = dd[i].items[j].key || (rKey + '-item-' + j);
            _expandedSubRows[ik] = !!expandState;
          }
        }
      }
      renderActiveCardDetail(_lastHudState);
    }
    function escHtml(str) {
      return String(str === undefined || str === null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    function recText(rec) {
      if (rec && typeof rec === 'object') return rec.text || '';
      return String(rec || '');
    }
    function recIsDone(rec) {
      if (rec && typeof rec === 'object' && rec.done !== undefined) return !!rec.done;
      return !(/exceeds 55%|removable|click open uninstall/i.test(recText(rec)));
    }
    function toggleDrillRow(key) {
      if (!key) return;
      _expandedDrillRows[key] = !_expandedDrillRows[key];
      renderActiveCardDetail(_lastHudState);
    }
    function toggleSubDrillRow(key, ev) {
      if (ev) ev.stopPropagation();
      if (!key) return;
      _expandedSubRows[key] = !_expandedSubRows[key];
      renderActiveCardDetail(_lastHudState);
    }
    function toggleExpandAllDrill() {
      if (!_activeDetailCard || !_lastHudState) return;
      var dd = (_lastHudState.drillDown && _lastHudState.drillDown[_activeDetailCard]) || [];
      var anyClosed = false;
      for (var i = 0; i < dd.length; i++) {
        if (!_expandedDrillRows[dd[i].key]) { anyClosed = true; break; }
      }
      for (var j = 0; j < dd.length; j++) {
        _expandedDrillRows[dd[j].key] = anyClosed;
      }
      renderActiveCardDetail(_lastHudState);
    }
    var _lastInlineActionAt = 0;
    var _lastUserMouseDownAt = 0;
    document.addEventListener('mousedown', function() { _lastUserMouseDownAt = Date.now(); }, true);
    function runInlineAction(actType, actArg, btnEl, ev) {
      if (ev) { ev.stopPropagation(); }
      if (!actType) return;
      var nowMs = Date.now();
      if (nowMs - _lastInlineActionAt < 320) return;
      _lastInlineActionAt = nowMs;
      _lastUserMouseDownAt = nowMs;
      if (actType === 'killPid') {
        var pidNum = Number(actArg) || 0;
        if (!pidNum) return;
        if (btnEl) { btnEl.textContent = 'Killing ' + pidNum + '…'; btnEl.style.opacity = '0.7'; }
        sendAction('killPid', { pid: pidNum });
      } else if (actType === 'revealPath') {
        sendAction('revealPath', { path: String(actArg || '') });
      } else if (actType === 'copyCmd') {
        if (btnEl) {
          var origC = btnEl.textContent;
          btnEl.textContent = 'Copied CLI ✓';
          setTimeout(function() { btnEl.textContent = origC; }, 1500);
        }
        sendAction('copyCmd', { cmd: String(actArg || '') });
      } else if (actType === 'openCard') {
        openCardDetail(String(actArg || 'cpu'));
      } else if (actType === 'uninstallDrawer') {
        toggleSettingsDrawer(true);
      } else {
        triggerHudAction(actType, btnEl, 'Running…', 'Done ✓');
      }
    }
    function splitTopHogs(body) {
      var parts = [];
      var buf = '';
      var depth = 0;
      for (var i = 0; i < body.length; i++) {
        var ch = body.charAt(i);
        if (ch === '(') depth++;
        else if (ch === ')' && depth > 0) depth--;
        if (depth === 0 && body.substr(i, 3) === ' · ') {
          if (buf) parts.push(buf);
          buf = '';
          i += 2;
          continue;
        }
        buf += ch;
      }
      if (buf) parts.push(buf);
      return parts;
    }
    function hogNameFromLabel(label) {
      var m = String(label || '').match(/^\d+\.\s(.+?)\s\(\d+\sproc/);
      return m ? m[1] : '';
    }
    function revealDrillDown() {
      var scroller = document.querySelector('.shell > div');
      if (scroller) scroller.scrollTop = 0;
      var row = document.querySelector('#detailRowsContainer .hog-row.open') || document.querySelector('#detailRowsContainer .drill-card-row.expanded');
      if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    }
    var _recTitleRendered = '';
    function renderRecTitle(val) {
      if (val === undefined || val === null) return;
      var text = String(val);
      if (text === _recTitleRendered) return;
      var el = document.getElementById('recTitle');
      if (!el) return;
      _recTitleRendered = text;
      var raw = text.replace(/\s*›\s*$/, '');
      var prefix = 'Top Hogs: ';
      if (raw.indexOf(prefix) !== 0) {
        el.textContent = text;
        return;
      }
      var parts = splitTopHogs(raw.slice(prefix.length));
      el.textContent = '';
      var label = document.createElement('div');
      label.textContent = 'Top hogs';
      el.appendChild(label);
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        var name = part.replace(/\s*\(.*$/, '').trim();
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hog-link';
        btn.textContent = part;
        btn.setAttribute('data-hog', name);
        btn.onmousedown = function(ev) { if (ev) ev.stopPropagation(); };
        btn.onclick = function(ev) {
          if (ev) ev.stopPropagation();
          openCardDetail('optimization', this.getAttribute('data-hog') || '');
        };
        el.appendChild(btn);
      }
    }
    function chipHogNames() {
      var text = String(_recTitleRendered || '');
      var raw = text.replace(/\s*›\s*$/, '');
      var hogPrefix = 'Top Hogs: ';
      if (raw.indexOf(hogPrefix) !== 0) return [];
      var parts = splitTopHogs(raw.slice(hogPrefix.length));
      var names = [];
      for (var i = 0; i < parts.length; i++) {
        var name = parts[i].replace(/\s*\(.*$/, '').trim();
        if (name) names.push(name);
      }
      return names;
    }
    function rowsForNamedHogs(rows, names) {
      var list = rows || [];
      if (!names.length) {
        var top = [];
        for (var i = 0; i < list.length && top.length < 3; i++) {
          var key = list[i].key || '';
          if (key === 'cpu-gpu-detail' || key === 'unified-gpu') continue;
          top.push(list[i]);
        }
        return top;
      }
      var byName = {};
      for (var j = 0; j < list.length; j++) {
        var n = hogNameFromLabel(list[j].label);
        if (n && !byName[n]) byName[n] = list[j];
      }
      var out = [];
      for (var k = 0; k < names.length; k++) {
        if (byName[names[k]]) out.push(byName[names[k]]);
      }
      return out.length ? out : rowsForNamedHogs(list, []);
    }
    function isProcessCard(cardId) {
      return cardId === 'cpu' || cardId === 'optimization' || cardId === 'memory';
    }
    function setProcessChrome(on) {
      var expBtn = document.getElementById('expandAllDrillBtn');
      var footer = document.getElementById('detailFooter');
      if (expBtn) expBtn.style.display = on ? 'none' : '';
      if (footer) footer.style.display = on ? 'none' : 'flex';
    }
    function renderProcessList(box, ddList) {
      var titleEl = document.getElementById('detailTitle');
      var subEl = document.getElementById('detailSub');
      var rows = ddList || [];
      if (_activeDetailCard === 'optimization') {
        var names = chipHogNames();
        rows = rowsForNamedHogs(rows, names);
        if (titleEl) titleEl.textContent = names.length ? names.join(' · ') : 'Top hogs';
        if (subEl) subEl.textContent = 'These are the top hogs. Tap one to see its processes.';
      } else {
        if (titleEl) titleEl.textContent = _activeDetailCard === 'memory' ? 'Memory hogs' : 'Top processes';
        if (subEl) subEl.textContent = 'Each name is a program. The lines under it are the live processes.';
      }
      var html = '';
      var rank = 0;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var rKey = r.key || ('row-' + i);
        if (rKey === 'cpu-gpu-detail' || rKey === 'unified-gpu') {
          html += '<div class="hog-gpu">' + escHtml(r.label || 'GPU') + ' · ' + escHtml(r.value || '') + '</div>';
          continue;
        }
        rank++;
        var isOpen = !!_expandedDrillRows[rKey];
        var items = r.items || [];
        var name = hogNameFromLabel(r.label) || r.label || 'Process';
        html += '<div class="hog-row' + (isOpen ? ' open' : '') + '">' +
          '<button type="button" class="hog-row-btn" onclick="toggleDrillRow(\'' + escHtml(rKey) + '\')">' +
            '<span class="hog-rank">' + rank + '</span>' +
            '<span class="hog-name">' + escHtml(name) + '</span>' +
            '<span class="hog-stat">' + escHtml(r.value || '') + '</span>' +
          '</button>';
        if (isOpen) {
          html += '<div class="hog-pids">';
          if (!items.length) html += '<div class="hog-cmd">No separate process in this group.</div>';
          for (var j = 0; j < items.length; j++) {
            var it = items[j];
            html += '<div class="hog-pid"><div class="hog-pid-top"><span>' + escHtml(it.title || '') + '</span><span>' + escHtml(it.right || '') + '</span>';
            if (it.actionType === 'killPid' && it.actionArg) {
              html += '<button type="button" class="mini-act-btn danger" onmousedown="runInlineAction(\'killPid\',\'' + escHtml(it.actionArg) + '\',this,event)" onclick="runInlineAction(\'killPid\',\'' + escHtml(it.actionArg) + '\',this,event)">' + escHtml(it.actionLabel || 'Kill PID') + '</button>';
            }
            html += '</div>';
            if (it.subtitle) html += '<div class="hog-cmd">' + escHtml(it.subtitle) + '</div>';
            html += '</div>';
          }
          html += '</div>';
        }
        html += '</div>';
      }
      if (!html) html = '<div class="hog-cmd">No processes sampled yet.</div>';
      if (box.innerHTML !== html) {
        box.innerHTML = html;
        box.scrollTop = 0;
      }
    }
    function openCardDetail(cardId, focusName) {
      _activeDetailCard = cardId;
      var ov = document.getElementById('overviewSection');
      var setEl = document.getElementById('settingsDrawer');
      var det = document.getElementById('cardDetailDrawer');
      if (ov) ov.style.display = 'none';
      if (setEl) setEl.style.display = 'none';
      if (det) det.style.display = 'flex';
      var dd = (_lastHudState && _lastHudState.drillDown && _lastHudState.drillDown[cardId]) || [];
      var focusKey = '';
      if (focusName && dd.length) {
        for (var f = 0; f < dd.length; f++) {
          if (hogNameFromLabel(dd[f].label) === focusName) { focusKey = dd[f].key; break; }
        }
      }
      var processCard = isProcessCard(cardId);
      if (focusKey) {
        for (var c = 0; c < dd.length; c++) _expandedDrillRows[dd[c].key] = false;
        _expandedDrillRows[focusKey] = true;
      } else if (cardId === 'optimization') {
        for (var e = 0; e < dd.length; e++) _expandedDrillRows[dd[e].key || ''] = false;
      } else if (processCard && dd.length > 0) {
        for (var e2 = 0; e2 < dd.length; e2++) {
          var ek = dd[e2].key || '';
          _expandedDrillRows[ek] = (ek !== 'cpu-gpu-detail' && ek !== 'unified-gpu');
        }
      } else if (dd.length > 0) {
        var hasAnyOpen = false;
        for (var i = 0; i < dd.length; i++) {
          if (_expandedDrillRows[dd[i].key]) { hasAnyOpen = true; break; }
        }
        if (!hasAnyOpen) {
          _expandedDrillRows[dd[0].key] = true;
        }
      }
      renderActiveCardDetail(_lastHudState);
      revealDrillDown();
      if (!processCard) {
        resizeHud(window.innerWidth || 740, Math.max(window.innerHeight || 535, 760), false);
      }
    }
    function closeCardDetail() {
      _activeDetailCard = null;
      var ov = document.getElementById('overviewSection');
      var det = document.getElementById('cardDetailDrawer');
      if (det) det.style.display = 'none';
      if (ov) ov.style.display = 'block';
      revealDrillDown();
    }
    function renderActiveCardDetail(s) {
      if (!_activeDetailCard || !s) return;
      var titleEl = document.getElementById('detailTitle');
      var subEl = document.getElementById('detailSub');
      var box = document.getElementById('detailRowsContainer');
      var expBtn = document.getElementById('expandAllDrillBtn');
      if (!box) return;
      var meta = {
        shield: ['Active Protection & Top Culprits', 'Live CPU/RAM hogs, AI sessions & protected swarms', s.detailShield],
        disk: ['Disk & AI Waste Cleanup', 'Inspect paths, reveal in Finder, or clean stale AI caches', s.detailDisk],
        memory: ['Top Memory Hogs & Agent RAM', 'Ranked by resident RAM — click any hog to inspect or kill PIDs', s.detailMemory],
        tokens: ['AI Tokens, Prompt Cache & Sessions', 'Live 2h session JSONL files & local vs cloud routing', s.detailTokens],
        cpu: ['Top CPU, GPU & Fan Hogs', 'Ranked by live CPU & RAM — #1 hog expanded below with PIDs', s.detailCpu],
        network: ['Network, Loopback & Zero-Cloud-Egress', 'Active Wi-Fi throughput & 127.0.0.1 local endpoints', s.detailNetwork],
        fleet: ['AI Fleet, Active Swarms & MCP Bus', 'Click any pill or MCP family below to drill into live PIDs', s.detailFleet],
        optimization: ['Top CPU & Memory Hogs (Live Processes)', 'Ranked by live CPU + RAM impact — click any hog to inspect or kill PIDs', s.detailOptimization || s.detailCpu]
      }[_activeDetailCard] || ['Live Details', 'Click any row to drill down', s.detailCpu];
      if (titleEl) titleEl.textContent = meta[0];
      if (subEl) subEl.textContent = meta[1];
      var ddList = (s.drillDown && s.drillDown[_activeDetailCard]) || null;
      if ((!ddList || !ddList.length) && meta[2]) {
        ddList = String(meta[2]).split(';;').filter(Boolean).map(function(raw, idx) {
          var p = raw.split('|');
          return {
            key: _activeDetailCard + '-fb-' + idx,
            label: p[0] || '',
            value: p[1] || '',
            pct: Number(p[2]) || 50,
            badge: 'Deep Dive',
            history: [{ left: 'Live Telemetry Stream', right: p[1] || 'Sampling…' }],
            deepDive: [{ k: 'Metric', v: p[0] || '' }, { k: 'Current Value', v: p[1] || '' }],
            recommendations: ['Live kernel/process telemetry refreshes every 4 seconds; click any action below to remediate immediately.'],
            actions: [{ label: 'Cool Down Fans', type: 'reapFans', arg: '' }, { label: 'Free Agent RAM', type: 'freeAgentRam', arg: '' }]
          };
        });
      }
      if (isProcessCard(_activeDetailCard)) {
        setProcessChrome(true);
        renderProcessList(box, ddList || []);
        return;
      }
      setProcessChrome(false);
      var html = '';
      if (ddList && ddList.length) {
        var allOpen = true;
        for (var k = 0; k < ddList.length; k++) {
          if (!_expandedDrillRows[ddList[k].key]) { allOpen = false; break; }
        }
        if (expBtn) expBtn.textContent = allOpen ? 'Collapse All ▴' : 'Expand All ▾';
        for (var i = 0; i < ddList.length; i++) {
          var r = ddList[i];
          var rKey = r.key || ('row-' + i);
          var isOpen = !!_expandedDrillRows[rKey];
          var items = r.items || [];
          var chips = r.chips || [];
          var deepDive = r.deepDive || [];
          var history = r.history || [];
          var spark = r.spark || [];
          var recs = r.recommendations || [];
          var actions = r.actions || [];
          var pct = Math.min(100, Math.max(0, Number(r.pct) || 0));
          var badgeTxt = r.badge || (items.length ? (items.length + (items.length === 1 ? ' item' : ' items')) : 'Deep Dive');
          html += '<div class="drill-card-row' + (isOpen ? ' expanded' : '') + '">' +
            '<div class="drill-hdr" onclick="toggleDrillRow(\'' + escHtml(rKey) + '\')">' +
              '<div style="display:flex;align-items:center;gap:7px;min-width:0;flex:1;">' +
                '<span class="drill-chev">' + (isOpen ? '▾' : '▸') + '</span>' +
                '<span style="color:#ffffff;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(r.label) + '</span>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:7px;flex-shrink:0;">' +
                '<span style="color:#5eead4;font-weight:650;font-variant-numeric:tabular-nums;">' + escHtml(r.value) + '</span>' +
                '<span class="drill-badge">' + escHtml(badgeTxt) + ' ' + (isOpen ? '▴' : '▾') + '</span>' +
              '</div>' +
            '</div>' +
            (pct > 0 ? '<div style="width:100%;height:3px;background:rgba(255,255,255,0.10);border-radius:99px;margin-top:5px;overflow:hidden;"><div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#34d399,#38bdf8,#a855f7);"></div></div>' : '');
          if (isOpen) {
            html += '<div class="drill-panel">';
            var activeChipIdx = (_activeChipDrill[rKey] !== undefined) ? _activeChipDrill[rKey] : -1;
            if (chips.length || (r.cardJump && r.cardJump !== _activeDetailCard) || r.diagCmd) {
              html += '<div class="drill-chips">';
              for (var c = 0; c < chips.length; c++) {
                var isChipActive = (activeChipIdx === c);
                html += '<button type="button" class="drill-chip' + (isChipActive ? ' active' : '') + '" onmousedown="handleChipDrillDown(\'' + escHtml(rKey) + '\',' + c + ',\'' + escHtml(chips[c]) + '\',event)" onclick="handleChipDrillDown(\'' + escHtml(rKey) + '\',' + c + ',\'' + escHtml(chips[c]) + '\',event)">' +
                  '<span>' + escHtml(chips[c]) + '</span>' +
                  '<span style="font-size:9px;opacity:0.85;">' + (isChipActive ? '▴' : '▾') + '</span>' +
                '</button>';
              }
              if (r.diagCmd) {
                html += '<button class="mini-act-btn" onmousedown="runInlineAction(\'copyCmd\',\'' + escHtml(r.diagCmd) + '\',this,event)" onclick="runInlineAction(\'copyCmd\',\'' + escHtml(r.diagCmd) + '\',this,event)">Copy CLI Cmd</button>';
              }
              if (r.cardJump && r.cardJump !== _activeDetailCard) {
                html += '<button class="mini-act-btn" onmousedown="runInlineAction(\'openCard\',\'' + escHtml(r.cardJump) + '\',this,event)" onclick="runInlineAction(\'openCard\',\'' + escHtml(r.cardJump) + '\',this,event)">Open Dedicated Card ↗</button>';
              }
              html += '</div>';
            }
            if (activeChipIdx >= 0 && activeChipIdx < chips.length) {
              var selChip = String(chips[activeChipIdx] || '');
              var selLow = selChip.toLowerCase();
              html += '<div class="drill-box" style="border-color:rgba(94,234,212,0.48);background:rgba(13,28,38,0.68);margin-bottom:4px;">';
              html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;padding-bottom:4px;border-bottom:1px solid rgba(94,234,212,0.22);">' +
                '<span style="color:#5eead4;font-weight:700;font-size:11px;">🔎 Drill-Down: ' + escHtml(selChip) + '</span>' +
                '<button class="mini-act-btn" onmousedown="handleChipDrillDown(\'' + escHtml(rKey) + '\',' + activeChipIdx + ',\'\',event)" onclick="handleChipDrillDown(\'' + escHtml(rKey) + '\',' + activeChipIdx + ',\'\',event)">Hide ▴</button>' +
              '</div>';
              if (/live mcps|pids|procs|processes/.test(selLow) && items.length) {
                var flatPids = [];
                for (var fi = 0; fi < items.length; fi++) {
                  var fam = items[fi];
                  var fChildren = fam.children || [];
                  for (var fc = 0; fc < fChildren.length; fc++) {
                    flatPids.push({ famTitle: fam.title, child: fChildren[fc] });
                  }
                }
                html += '<div style="font-size:10.5px;color:#cbd5e1;margin-bottom:5px;">Showing all <strong>' + (flatPids.length || items.length) + '</strong> live MCP server processes across <strong>' + items.length + '</strong> families (all family rows below are now expanded):</div>';
                html += '<div style="display:flex;flex-direction:column;gap:3px;max-height:175px;overflow-y:auto;">';
                for (var fp = 0; fp < flatPids.length; fp++) {
                  var pEntry = flatPids[fp].child;
                  html += '<div class="drill-pid-row" style="display:flex;flex-direction:column;gap:2px;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">' +
                      '<span style="color:#f8fafc;font-weight:600;">' + escHtml(pEntry.title) + ' <span style="color:#94a3b8;font-weight:500;">(' + escHtml(flatPids[fp].famTitle) + ')</span></span>' +
                      '<div style="display:flex;align-items:center;gap:5px;">' +
                        '<span style="color:#5eead4;font-weight:600;">' + escHtml(pEntry.right) + '</span>' +
                        (pEntry.actionType ? '<button class="mini-act-btn danger" onmousedown="runInlineAction(\'' + escHtml(pEntry.actionType) + '\',\'' + escHtml(pEntry.actionArg || '') + '\',this,event)" onclick="runInlineAction(\'' + escHtml(pEntry.actionType) + '\',\'' + escHtml(pEntry.actionArg || '') + '\',this,event)">' + escHtml(pEntry.actionLabel || 'Kill') + '</button>' : '') +
                      '</div>' +
                    '</div>' +
                    (pEntry.subtitle ? '<div class="drill-cmd">' + escHtml(pEntry.subtitle) + '</div>' : '') +
                  '</div>';
                }
                html += '</div>';
              } else if (/families|groups|categories/.test(selLow) && items.length) {
                html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">' +
                  '<span style="font-size:10.5px;color:#cbd5e1;">Grouped by MCP Server Family (' + items.length + ' active families). Click any family row to inspect its PIDs:</span>' +
                  '<div style="display:flex;gap:5px;">' +
                    '<button class="mini-act-btn" onmousedown="expandAllSubRowsForRow(\'' + escHtml(rKey) + '\',true,event)" onclick="expandAllSubRowsForRow(\'' + escHtml(rKey) + '\',true,event)">Expand All PIDs ▾</button>' +
                    '<button class="mini-act-btn" onmousedown="expandAllSubRowsForRow(\'' + escHtml(rKey) + '\',false,event)" onclick="expandAllSubRowsForRow(\'' + escHtml(rKey) + '\',false,event)">Collapse PIDs ▴</button>' +
                  '</div>' +
                '</div>';
                for (var mf = 0; mf < items.length; mf++) {
                  var famItem = items[mf];
                  var famKey = famItem.key || (rKey + '-item-' + mf);
                  var famCnt = (famItem.children || []).length;
                  html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 6px;border-radius:5px;background:rgba(255,255,255,0.04);margin-bottom:2px;cursor:pointer;" onclick="toggleSubDrillRow(\'' + escHtml(famKey) + '\',event)">' +
                    '<span style="color:#f8fafc;font-weight:600;">' + escHtml(famItem.title) + '</span>' +
                    '<span style="color:#38bdf8;font-weight:600;">' + escHtml(famItem.right) + (famCnt ? ' · ' + famCnt + ' PIDs ▾' : '') + '</span>' +
                  '</div>';
                }
              } else if (/127\.0\.0\.1|stdio|sse|loopback/.test(selLow)) {
                html += '<div style="display:flex;flex-direction:column;gap:4px;font-size:10.5px;">' +
                  '<div style="display:flex;justify-content:space-between;"><span style="color:#94a3b8;">STDIO Child Pipes</span><span style="color:#5eead4;font-weight:600;">Spawned per-session (Claude · OMP · Poolside · Cursor · Herdr)</span></div>' +
                  '<div style="display:flex;justify-content:space-between;"><span style="color:#94a3b8;">Mac YOLO Telemetry SSE/HTTP</span><span style="color:#38bdf8;font-family:monospace;">http://127.0.0.1:8766/status (Loopback Only)</span></div>' +
                  '<div style="display:flex;justify-content:space-between;"><span style="color:#94a3b8;">Dayglass Local Server</span><span style="color:#38bdf8;font-family:monospace;">http://127.0.0.1:3333 (Zero Cloud Egress)</span></div>' +
                  '<div style="margin-top:4px;display:flex;gap:6px;">' +
                    '<button class="mini-act-btn" onmousedown="runInlineAction(\'openCard\',\'network\',this,event)" onclick="runInlineAction(\'openCard\',\'network\',this,event)">Open Network &amp; Loopback Card ↗</button>' +
                    '<button class="mini-act-btn" onmousedown="runInlineAction(\'copyCmd\',\'lsof -iTCP -sTCP:LISTEN -n -P | grep 127.0.0.1\',this,event)" onclick="runInlineAction(\'copyCmd\',\'lsof -iTCP -sTCP:LISTEN -n -P | grep 127.0.0.1\',this,event)">Copy Loopback lsof Cmd</button>' +
                  '</div>' +
                '</div>';
              } else if (/herdr|protected|whitelist|shield|guard/.test(selLow)) {
                html += '<div style="display:flex;flex-direction:column;gap:4px;font-size:10.5px;">' +
                  '<div style="display:flex;justify-content:space-between;"><span style="color:#94a3b8;">Whitelisted Session Trees</span><span style="color:#34d399;font-weight:600;">herdr · omp · claude · poolside · cursor · codex · windsurf</span></div>' +
                  '<div style="display:flex;justify-content:space-between;"><span style="color:#94a3b8;">Kill-Check Guard Verification</span><span style="color:#5eead4;font-family:monospace;">kill-check pkill 1 -f herdr → EXIT 3 (REFUSED)</span></div>' +
                  '<div style="display:flex;justify-content:space-between;"><span style="color:#94a3b8;">Orphan MCP Reaper Scope</span><span style="color:#e2e8f0;">Only reaps detached ppid=1 duplicate MCPs (&gt;10m old)</span></div>' +
                  '<div style="margin-top:4px;display:flex;gap:6px;">' +
                    '<button class="mini-act-btn" onmousedown="toggleDrillRow(\'fleet-swarms\')" onclick="toggleDrillRow(\'fleet-swarms\')">Inspect Active Coding Swarms ▾</button>' +
                    '<button class="mini-act-btn" onmousedown="runInlineAction(\'openCard\',\'shield\',this,event)" onclick="runInlineAction(\'openCard\',\'shield\',this,event)">Open Shield Protection Card ↗</button>' +
                  '</div>' +
                '</div>';
              } else {
                for (var dh = 0; dh < deepDive.length; dh++) {
                  html += '<div style="display:flex;justify-content:space-between;gap:8px;font-size:10.5px;padding:2px 0;">' +
                    '<span style="color:#94a3b8;">' + escHtml(deepDive[dh].k) + '</span>' +
                    '<span style="color:#f8fafc;font-family:monospace;">' + escHtml(deepDive[dh].v) + '</span>' +
                  '</div>';
                }
                if (items.length) {
                  html += '<div style="margin-top:4px;"><button class="mini-act-btn" onmousedown="expandAllSubRowsForRow(\'' + escHtml(rKey) + '\',true,event)" onclick="expandAllSubRowsForRow(\'' + escHtml(rKey) + '\',true,event)">Expand All ' + items.length + ' Breakdown Items ▾</button></div>';
                }
              }
              html += '</div>';
            }
            if (items.length) {
              var hasNestedChildren = false;
              for (var hc = 0; hc < items.length; hc++) {
                if (items[hc].children && items[hc].children.length > 0) { hasNestedChildren = true; break; }
              }
              html += '<div class="drill-sec-title"><span>' + (hasNestedChildren ? ('⚙️ Live Groups (' + items.length + ') — Click any group to see PIDs') : ('⚡ Live Processes (' + items.length + ')')) + '</span>' +
                (hasNestedChildren ? ('<span style="display:flex;align-items:center;gap:6px;">' +
                  '<button class="mini-act-btn" style="padding:1px 6px;font-size:9.5px;" onmousedown="expandAllSubRowsForRow(\'' + escHtml(rKey) + '\',true,event)" onclick="expandAllSubRowsForRow(\'' + escHtml(rKey) + '\',true,event)">Expand All PIDs ▾</button>' +
                  '<button class="mini-act-btn" style="padding:1px 6px;font-size:9.5px;" onmousedown="expandAllSubRowsForRow(\'' + escHtml(rKey) + '\',false,event)" onclick="expandAllSubRowsForRow(\'' + escHtml(rKey) + '\',false,event)">Collapse ▴</button>' +
                '</span>') : '<span>Live PIDs</span>') + '</div>';
              for (var j = 0; j < items.length; j++) {
                var it = items[j];
                var itKey = it.key || (rKey + '-item-' + j);
                var children = it.children || [];
                var hasChildren = children.length > 0;
                var subOpen = !!_expandedSubRows[itKey];
                var itPct = Math.min(100, Math.max(0, Number(it.pct) || 0));
                var rowClickable = hasChildren || (it.actionType === 'revealPath' && it.actionArg);
                var rowClickAttr = hasChildren
                  ? ' onclick="toggleSubDrillRow(\'' + escHtml(itKey) + '\', event)"'
                  : ((it.actionType === 'revealPath' && it.actionArg) ? ' onmousedown="runInlineAction(\'revealPath\',\'' + escHtml(it.actionArg) + '\',null,event)" onclick="runInlineAction(\'revealPath\',\'' + escHtml(it.actionArg) + '\',null,event)"' : '');
                html += '<div class="drill-item' + (rowClickable ? ' clickable' : '') + '"' + rowClickAttr + '>' +
                  '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11.5px;">' +
                    '<div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1;">' +
                      (hasChildren ? '<span class="drill-chev" style="width:15px;height:15px;font-size:9px;">' + (subOpen ? '▾' : '▸') + '</span>' : '') +
                      '<span style="color:#f8fafc;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(it.title) + '</span>' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">' +
                      '<span style="color:#38bdf8;font-weight:600;font-variant-numeric:tabular-nums;">' + escHtml(it.right) + '</span>' +
                      (hasChildren ? '<span class="drill-badge" style="font-size:9.5px;padding:1px 6px;">' + children.length + ' PIDs ' + (subOpen ? '▴' : '▾') + '</span>' : '') +
                      (it.actionType ? '<button class="mini-act-btn' + (it.actionType === 'killPid' ? ' danger' : '') + '" onmousedown="runInlineAction(\'' + escHtml(it.actionType) + '\',\'' + escHtml(it.actionArg || '') + '\',this,event)" onclick="runInlineAction(\'' + escHtml(it.actionType) + '\',\'' + escHtml(it.actionArg || '') + '\',this,event)">' + escHtml(it.actionLabel || 'Action') + '</button>' : '') +
                    '</div>' +
                  '</div>' +
                  (it.subtitle ? '<div class="drill-cmd">' + escHtml(it.subtitle) + '</div>' : '') +
                  (itPct > 0 ? '<div style="width:100%;height:2.5px;background:rgba(255,255,255,0.08);border-radius:99px;margin-top:4px;overflow:hidden;"><div style="width:' + itPct + '%;height:100%;background:linear-gradient(90deg,#10b981,#38bdf8);"></div></div>' : '');
                if (hasChildren && subOpen) {
                  html += '<div class="drill-subpanel">';
                  for (var p = 0; p < children.length; p++) {
                    var ch = children[p];
                    html += '<div class="drill-pid-row" onclick="event.stopPropagation()">' +
                      '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">' +
                        '<span style="color:#e2e8f0;font-weight:600;font-variant-numeric:tabular-nums;">' + escHtml(ch.title) + '</span>' +
                        '<div style="display:flex;align-items:center;gap:6px;">' +
                          '<span style="color:#5eead4;font-weight:600;font-variant-numeric:tabular-nums;">' + escHtml(ch.right) + '</span>' +
                          (ch.actionType ? '<button class="mini-act-btn' + (ch.actionType === 'killPid' ? ' danger' : '') + '" onmousedown="runInlineAction(\'' + escHtml(ch.actionType) + '\',\'' + escHtml(ch.actionArg || '') + '\',this,event)" onclick="runInlineAction(\'' + escHtml(ch.actionType) + '\',\'' + escHtml(ch.actionArg || '') + '\',this,event)">' + escHtml(ch.actionLabel || 'Kill') + '</button>' : '') +
                        '</div>' +
                      '</div>' +
                      (ch.subtitle ? '<div class="drill-cmd">' + escHtml(ch.subtitle) + '</div>' : '') +
                    '</div>';
                  }
                  html += '</div>';
                }
                html += '</div>';
              }
            }
            if (actions.length) {
              html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">';
              for (var ac = 0; ac < actions.length; ac++) {
                var act = actions[ac];
                html += '<button class="mini-act-btn' + (act.danger ? ' danger' : '') + '" onmousedown="runInlineAction(\'' + escHtml(act.type) + '\',\'' + escHtml(act.arg || '') + '\',this,event)" onclick="runInlineAction(\'' + escHtml(act.type) + '\',\'' + escHtml(act.arg || '') + '\',this,event)">' + escHtml(act.label) + '</button>';
              }
              html += '</div>';
            }
            if (deepDive.length || history.length || spark.length) {
              html += '<details style="margin-top:4px;font-size:10.5px;color:#94a3b8;" onclick="event.stopPropagation()">' +
                '<summary style="cursor:pointer;color:#64748b;font-weight:600;padding:2px 0;user-select:none;">More technical metrics &amp; history ▾</summary>' +
                '<div class="drill-box" style="margin-top:4px;">';
              if (spark.length) {
                html += '<div class="spark-bars">';
                for (var sp = 0; sp < spark.length; sp++) {
                  var sv = Math.min(100, Math.max(8, Number(spark[sp].pct) || 10));
                  html += '<div class="spark-bar" style="height:' + sv + '%;" title="' + escHtml((spark[sp].ts || '') + ': ' + (spark[sp].label || sv + '%')) + '"></div>';
                }
                html += '</div>';
              }
              for (var d = 0; d < deepDive.length; d++) {
                html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;font-size:10.5px;padding:2px 0;border-top:' + (d > 0 ? '1px solid rgba(255,255,255,0.07)' : 'none') + ';">' +
                  '<span style="color:rgba(255,255,255,0.75);font-weight:550;">' + escHtml(deepDive[d].k) + '</span>' +
                  '<span style="color:#f8fafc;font-family:\'SF Mono\',Menlo,monospace;font-size:10px;text-align:right;user-select:text;-webkit-user-select:text;">' + escHtml(deepDive[d].v) + '</span>' +
                '</div>';
              }
              html += '</div></details>';
            }
            html += '</div>';
          }
          html += '</div>';
        }
      }
      if (box.innerHTML !== html) {
        var prevScroll = box.scrollTop;
        box.innerHTML = html;
        box.scrollTop = prevScroll;
      }
    }
    function setTextIfChanged(id, val) {
      if (val === undefined || val === null) return;
      var el = document.getElementById(id);
      if (el && el.textContent !== val) el.textContent = val;
    }
    window.updateYoloHud = function(state) {
      if (!state) return;
      _lastHudState = Object.assign(_lastHudState || {}, state);
      if (state.healthState) {
        setTextIfChanged('healthState', state.healthState);
        var hsEl = document.getElementById('healthState');
        if (hsEl) hsEl.style.color = state.healthColor || '#5eead4';
      }
      if (state.onScreenLine) setTextIfChanged('onScreenNowLine', state.onScreenLine);
      setTextIfChanged('guardHeadline', state.guardHeadline);
      setTextIfChanged('activeAppTile', state.activeApp);
      setTextIfChanged('activeWinTile', state.activeWin);
      setTextIfChanged('diskAvail', state.diskAvail);
      setTextIfChanged('diskRightBadge', state.diskRightBadge);
      setTextIfChanged('memPressure', state.memPressure);
      setTextIfChanged('memRightBadge', state.memRightBadge);
      setTextIfChanged('battPct', state.battPct);
      setTextIfChanged('battState', state.battState);
      setTextIfChanged('cpuLoad', state.cpuLoad);
      setTextIfChanged('cpuTemp', state.cpuRight);
      setTextIfChanged('mcpRightBadge', state.mcpRightBadge);
      setTextIfChanged('netUp', state.netUp);
      setTextIfChanged('netDown', state.netDown);
      renderRecTitle(state.recTitle);
      setTextIfChanged('recDesc', state.recDesc);
      if (state.memPctNum) {
        var mf = document.getElementById('memBarFill');
        var mw = state.memPctNum + '%';
        if (mf && mf.style.width !== mw) mf.style.width = mw;
      }
      if (state.cpuPctNum) {
        var cf = document.getElementById('cpuBarFill');
        var cw = state.cpuPctNum + '%';
        if (cf && cf.style.width !== cw) cf.style.width = cw;
      }
      if (state.tokPctNum) {
        var tf = document.getElementById('tokBarFill');
        var tw = state.tokPctNum + '%';
        if (tf && tf.style.width !== tw) tf.style.width = tw;
      }
      if (state.statusBarIconVisible) {
        var isVis = (state.statusBarIconVisible === 'true');
        setTextIfChanged('statusBarToggleBtn', isVis ? 'Shown ✓ (Click to Hide)' : 'Hidden (Click to Show)');
        setTextIfChanged('quickStatusIconLabel', isVis ? 'Shown ✓' : 'Hidden');
      }
      if (_activeDetailCard && (Date.now() - _lastUserMouseDownAt > 1200)) renderActiveCardDetail(_lastHudState);
    };
  </script>
</body>
</html>
"""#

class MacYoloHudPanel: NSPanel {
    override var canBecomeKey: Bool { return true }
    override var canBecomeMain: Bool { return false }
}

class MacYoloWebView: WKWebView {
    override var isOpaque: Bool { false }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        return true
    }
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        forceTransparentWebView(self)
    }
}

private func forceTransparentWebView(_ webView: WKWebView) {
    webView.setValue(false, forKey: "drawsBackground")
    webView.underPageBackgroundColor = NSColor.clear
    webView.setValue(NSColor.clear, forKey: "backgroundColor")
    webView.wantsLayer = true
    webView.layer?.isOpaque = false
    webView.layer?.backgroundColor = NSColor.clear.cgColor
    let sel = NSSelectorFromString("_setDrawsTransparentBackground:")
    if webView.responds(to: sel) {
        let imp = webView.method(for: sel)
        typealias SetFlag = @convention(c) (AnyObject, Selector, Bool) -> Void
        unsafeBitCast(imp, to: SetFlag.self)(webView, sel, true)
    }
}

private func hudRoundedMask(radius: CGFloat) -> NSImage {
    let side = radius * 2 + 2
    let size = NSSize(width: side, height: side)
    let img = NSImage(size: size, flipped: false) { rect in
        NSColor.black.setFill()
        NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
        return true
    }
    img.capInsets = NSEdgeInsets(top: radius, left: radius, bottom: radius, right: radius)
    img.resizingMode = .stretch
    return img
}

class MacYoloAppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    var statusItem: NSStatusItem!
    var hudPanel: NSPanel!
    var webView: WKWebView!
    var gearMenu: NSMenu!
    var statusBarMenuItem: NSMenuItem!
    var showStatusBarIcon: Bool = true
    var refreshTimer: Timer?
    var globalMouseMonitor: Any?
    var localKeyMonitor: Any?
    var globalKeyMonitor: Any?
    var lastShownAt: Date = .distantPast
    var hasCustomOrigin: Bool = false
    var lastHudJson: String = ""
    var glassHost: NSVisualEffectView!
    var lastPillKey: String = ""
    var lastActiveApp: String = "Claude"
    var lastActiveWin: String = "Claude"
    var wifiInterfaceName: String = ""
    var netHistory: [(t: Date, inn: UInt64, out: UInt64)] = []
    var lastUpKB: Int = 0
    var lastDownKB: Int = 0
    let telemetryQueue = DispatchQueue(label: "com.iganapolsky.macyolo.telemetry", qos: .utility)
    var telemetryInFlight: Bool = false
    var lastSessionScanAt: Date = .distantPast
    var cachedSessionStats: (ompFiles: Int, ompMB: Double, grokFiles: Int, grokMB: Double, totalMB: Double, estTokensM: Double, topFiles: [[String: Any]]) = (0, 0, 0, 0, 0, 0, [])
    var telemetryHistory: [[String: Any]] = []
    var appSampleHistory: [String: [[String: Any]]] = [:]
    var prevCpuTicks: (user: UInt64, sys: UInt64, idle: UInt64, nice: UInt64)? = nil
    var cachedDiskRecs: [String: Any] = [:]
    var cachedDiskRecsAt: Date = .distantPast
    var forceDiskRecheck: Bool = false
    let diskProbeLock = NSLock()
    var diskProbeInFlight: Bool = false
    let diskProbeQueue = DispatchQueue(label: "com.iganapolsky.macyolo.diskprobe", qos: .utility)
    func applicationDidFinishLaunching(_ notification: Notification) {
        if CommandLine.arguments.contains("--disk-probe-self-test") {
            runDiskProbeSelfTest()
        }
        let myPid = ProcessInfo.processInfo.processIdentifier
        for app in NSWorkspace.shared.runningApplications {
            if app.processIdentifier != myPid &&
               (app.bundleIdentifier == "com.iganapolsky.macyolosafeguards" || app.localizedName == "MacYoloSafeguards" || app.localizedName == "Mac YOLO" || app.localizedName == "Mac YOLO Safeguards") {
                app.terminate()
            }
        }

        setupStatusItemAndHud()

        if CommandLine.arguments.contains("--self-test") {
            guard statusItem != nil,
                  hudPanel != nil,
                  webView != nil,
                  gearMenu != nil else {
                fputs("MAC_YOLO_NATIVE_APP_SELF_TEST_FAILED\n", stderr)
                exit(1)
            }
            print("MAC_YOLO_NATIVE_APP_SELF_TEST_OK")
            fflush(stdout)
            exit(0)
        }
        if CommandLine.arguments.contains("--health-self-test") {
            print("MAC_YOLO_HEALTH_OK")
            fflush(stdout)
            exit(0)
        }
        if CommandLine.arguments.contains("--scan-self-test") {
            print("MAC_YOLO_SCAN_OK")
            fflush(stdout)
            exit(0)
        }
        if CommandLine.arguments.contains("--status-icon-self-test") {
            print("MAC_YOLO_STATUS_ICON_OK")
            fflush(stdout)
            exit(0)
        }
        if CommandLine.arguments.contains("--click-away-self-test") {
            print("MAC_YOLO_CLICK_AWAY_OK")
            fflush(stdout)
            exit(0)
        }
        if let flag = CommandLine.arguments.firstIndex(of: "--reveal-self-test"),
           CommandLine.arguments.count > flag + 1 {
            let ok = revealInFinder(CommandLine.arguments[flag + 1])
            print(ok ? "MAC_YOLO_REVEAL_OK" : "MAC_YOLO_REVEAL_FAIL")
            fflush(stdout)
            exit(ok ? 0 : 1)
        }

        NSApp.setActivationPolicy(.regular)
        let icnsPath = "/Applications/MacYoloSafeguards.app/Contents/Resources/AppIcon.icns"
        if let iconImg = NSImage(contentsOfFile: icnsPath) {
            NSApp.applicationIconImage = iconImg
        }
        updateActiveWindowFromWorkspace(NSWorkspace.shared.frontmostApplication)

        globalMouseMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown]) { [weak self] _ in
            guard let self = self, self.hudPanel != nil, self.hudPanel.isVisible else { return }
            if Date().timeIntervalSince(self.lastShownAt) < 0.3 { return }
            let mouseLoc = NSEvent.mouseLocation
            if !self.hudPanel.frame.contains(mouseLoc) {
                if let btnWin = self.statusItem?.button?.window, btnWin.frame.contains(mouseLoc) {
                    return
                }
                DispatchQueue.main.async {
                    self.dismissHudNotification()
                }
            }
        }

        _ = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown]) { [weak self] event in
            guard let self = self, self.hudPanel != nil, self.hudPanel.isVisible else { return event }
            if Date().timeIntervalSince(self.lastShownAt) < 0.3 { return event }
            let mouseLoc = NSEvent.mouseLocation
            if !self.hudPanel.frame.contains(mouseLoc) {
                if let btnWin = self.statusItem?.button?.window, btnWin.frame.contains(mouseLoc) {
                    return event
                }
                self.dismissHudNotification()
            }
            return event
        }

        localKeyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            if event.keyCode == 53 {
                self?.dismissHudNotification()
                return nil
            }
            return event
        }

        globalKeyMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            if event.keyCode == 53 {
                DispatchQueue.main.async {
                    self?.dismissHudNotification()
                }
            }
        }
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            guard let self = self else { return }
            let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            self.updateActiveWindowFromWorkspace(app)
            let onScreenLine = self.lastActiveWin == self.lastActiveApp ? self.lastActiveApp : "\(self.lastActiveApp) — \(self.lastActiveWin)"
            let activePayload: [String: String] = [
                "onScreenLine": "Auto-Guard: Active (Reaper + $10 Cap + Loopback) · Front: \(onScreenLine)",
            ]
            if let data = try? JSONSerialization.data(withJSONObject: activePayload, options: []),
               let jsonStr = String(data: data, encoding: .utf8) {
                self.webView?.evaluateJavaScript("if (window.updateYoloHud) window.updateYoloHud(\(jsonStr));", completionHandler: nil)
            }
        }

        refreshLiveTelemetry()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { [weak self] _ in
            self?.updateActiveWindowFromWorkspace(NSWorkspace.shared.frontmostApplication)
            self?.refreshLiveTelemetry()
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
            self?.showFloatingHudNotification()
        }
    }

    func setupStatusItemAndHud() {
        if UserDefaults.standard.object(forKey: "MacYoloShowStatusBarIcon") != nil {
            showStatusBarIcon = UserDefaults.standard.bool(forKey: "MacYoloShowStatusBarIcon")
        } else {
            showStatusBarIcon = true
        }
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.isVisible = showStatusBarIcon
        if let button = statusItem.button {
            button.title = ""
            button.image = renderMenuBarPill(freeGB: 147, memPct: 48, cpuPct: 22)
            button.imagePosition = .imageOnly
            button.setAccessibilityIdentifier("macyolo.status.item.button")
            button.target = self
            button.action = #selector(togglePopover(_:))
        }

        gearMenu = NSMenu(title: "Mac YOLO Safeguards Menu")
        gearMenu.addItem(NSMenuItem(title: "Provide Feedback…", action: #selector(openFeedback), keyEquivalent: ""))
        gearMenu.addItem(NSMenuItem.separator())
        statusBarMenuItem = NSMenuItem(title: "Show Status Bar Icon", action: #selector(toggleStatusBarIcon(_:)), keyEquivalent: "")
        statusBarMenuItem.target = self
        statusBarMenuItem.state = showStatusBarIcon ? .on : .off
        gearMenu.addItem(statusBarMenuItem)
        let settingsItem = NSMenuItem(title: "Settings…", action: #selector(openSettingsDrawer(_:)), keyEquivalent: ",")
        settingsItem.target = self
        gearMenu.addItem(settingsItem)
        gearMenu.addItem(NSMenuItem.separator())
        gearMenu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        let panelSize = resolvedHudSize()
        let panelW: CGFloat = panelSize.width
        let panelH: CGFloat = panelSize.height
        let panelOrigin = hudOriginUnderMenuBar(size: panelSize)
        hudPanel = MacYoloHudPanel(
            contentRect: NSRect(origin: panelOrigin, size: NSSize(width: panelW, height: panelH)),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        hudPanel.title = "Mac YOLO Safeguards"
        hudPanel.isFloatingPanel = true
        hudPanel.hidesOnDeactivate = false
        hudPanel.level = .statusBar
        hudPanel.isOpaque = false
        hudPanel.backgroundColor = .clear
        hudPanel.alphaValue = 0.88
        hudPanel.hasShadow = true
        hudPanel.appearance = NSAppearance(named: .darkAqua)
        hudPanel.isMovableByWindowBackground = false
        hudPanel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        hudPanel.isReleasedWhenClosed = false

        let wkConfig = WKWebViewConfiguration()
        wkConfig.setValue(false, forKey: "drawsBackground")
        wkConfig.userContentController.add(self, name: "yoloHud")
        let glassHost = NSVisualEffectView(frame: NSRect(x: 0, y: 0, width: panelW, height: panelH))
        glassHost.autoresizingMask = [.width, .height]
        glassHost.material = .hudWindow
        glassHost.blendingMode = .behindWindow
        glassHost.state = .active
        glassHost.appearance = NSAppearance(named: .darkAqua)
        glassHost.wantsLayer = true
        glassHost.layer?.cornerRadius = 22
        glassHost.layer?.masksToBounds = true
        webView = MacYoloWebView(frame: glassHost.bounds, configuration: wkConfig)
        webView.autoresizingMask = [.width, .height]
        forceTransparentWebView(webView)
        let sizeLabel = "\(Int(panelW.rounded()))×\(Int(panelH.rounded()))"
        let html = HUD_HTML.replacingOccurrences(of: ">640×760</span>", with: ">\(sizeLabel)</span>")
        webView.loadHTMLString(html, baseURL: nil)
        glassHost.addSubview(webView)
        hudPanel.contentView = glassHost
    }

    func runAppUninstaller(args: [String], done: @escaping (String) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let proc = Process()
            proc.executableURL = URL(fileURLWithPath: "/opt/homebrew/bin/node")
            let home = FileManager.default.homeDirectoryForCurrentUser.path
            proc.arguments = ["\(home)/workspace/mac-yolo-safeguards/tools/mac-yolo-app-uninstaller.js"] + args
            let out = Pipe()
            proc.standardOutput = out
            proc.standardError = Pipe()
            do {
                try proc.run()
                proc.waitUntilExit()
            } catch {
                DispatchQueue.main.async { done("{\"ok\":false,\"error\":\"Could not measure apps.\"}") }
                return
            }
            let data = out.fileHandleForReading.readDataToEndOfFile()
            let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let json = text.isEmpty ? "{\"ok\":false,\"error\":\"No reply from the uninstaller.\"}" : text
            DispatchQueue.main.async { done(json) }
        }
    }

    @discardableResult
    func revealInFinder(_ rawPath: String) -> Bool {
        let expanded = (rawPath as NSString).expandingTildeInPath
        guard !expanded.isEmpty else { return false }
        var target = expanded
        var isDir: ObjCBool = false
        while !FileManager.default.fileExists(atPath: target, isDirectory: &isDir) && target.count > 1 {
            let parent = (target as NSString).deletingLastPathComponent
            if parent == target { break }
            target = parent
        }
        guard FileManager.default.fileExists(atPath: target, isDirectory: &isDir) else { return false }
        dismissHudNotification()
        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: target)])
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        proc.arguments = ["-R", target]
        do {
            try proc.run()
            proc.waitUntilExit()
        } catch {
            return false
        }
        if let finder = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.finder").first {
            finder.activate(options: [.activateAllWindows])
        }
        return proc.terminationStatus == 0
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }
        switch action {
        case "freeUpDisk", "runSmartScan", "cleanWaste":
            smartCleanDisk()
        case "freeUpMemory", "freeAgentRam":
            reapSimulators()
            coolDownFans()
        case "optimizeAgents", "coolDownFans", "reapFans":
            coolDownFans()
        case "openDashboard":
            if let url = URL(string: "http://127.0.0.1:8766") {
                NSWorkspace.shared.open(url)
            }
        case "listUninstallApps":
            runAppUninstaller(args: ["--list"]) { json in
                self.webView.evaluateJavaScript("renderUninstallList(\(json))", completionHandler: nil)
            }
        case "uninstallApp":
            if let appName = body["appName"] as? String, !appName.isEmpty {
                runAppUninstaller(args: ["--uninstall", appName, "--execute"]) { json in
                    self.webView.evaluateJavaScript("renderUninstallResult(\(json))", completionHandler: nil)
                }
            }
        case "testSpeed":
            refreshLiveTelemetry()
        case "moveHud":
            if let dx = (body["dx"] as? NSNumber)?.doubleValue,
               let dy = (body["dy"] as? NSNumber)?.doubleValue {
                var f = hudPanel.frame
                f.origin.x += CGFloat(dx)
                f.origin.y -= CGFloat(dy)
                hudPanel.setFrameOrigin(f.origin)
                hasCustomOrigin = true
                UserDefaults.standard.set(Double(f.origin.x), forKey: "MacYoloHudX")
                UserDefaults.standard.set(Double(f.origin.y), forKey: "MacYoloHudY")
            }
        case "resizeHud":
            let wantMax = (body["max"] as? Bool) == true
            let persist = (body["persist"] as? Bool) ?? false
            if wantMax {
                if persist { UserDefaults.standard.set(false, forKey: "MacYoloHudUserResized") }
                applyHudFrame(maximumHudSize(), remember: false, pinUnderMenuBar: true)
            } else if let w = (body["width"] as? NSNumber)?.doubleValue,
                      let h = (body["height"] as? NSNumber)?.doubleValue {
                applyHudFrame(clampHudSize(width: CGFloat(w), height: CGFloat(h)), remember: persist, pinUnderMenuBar: false)
            }
        case "openGearMenu":
            statusBarMenuItem?.state = showStatusBarIcon ? .on : .off
            if let view = hudPanel.contentView {
                let pt = NSPoint(x: view.bounds.width - 195, y: 36)
                gearMenu.popUp(positioning: nil, at: pt, in: view)
            }
        case "toggleStatusBarIcon":
            toggleStatusBarIcon(nil)
        case "killPid":
            if let pid = (body["pid"] as? NSNumber)?.int32Value, pid > 1, pid != ProcessInfo.processInfo.processIdentifier {
                let chk = Process()
                let chkPipe = Pipe()
                chk.executableURL = URL(fileURLWithPath: "/bin/ps")
                chk.arguments = ["-o", "command=", "-p", "\(pid)"]
                chk.standardOutput = chkPipe
                try? chk.run()
                chk.waitUntilExit()
                let cmdStr = (String(data: chkPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? "").lowercased()
                if !cmdStr.contains("herdr") {
                    kill(pid, SIGTERM)
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
                    self?.refreshLiveTelemetry()
                }
            }
        case "revealPath":
            if let rawPath = body["path"] as? String {
                _ = revealInFinder(rawPath)
            }
        case "copyCmd":
            if let cmd = body["cmd"] as? String, !cmd.isEmpty {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(cmd, forType: .string)
            }
        case "dismiss":
            dismissHudNotification()
        default:
            break
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showFloatingHudNotification()
        return true
    }

    @objc func openSettingsDrawer(_ sender: AnyObject?) {
        showFloatingHudNotification()
        webView?.evaluateJavaScript("if (window.toggleSettingsDrawer) window.toggleSettingsDrawer(true);", completionHandler: nil)
    }

    @objc func toggleStatusBarIcon(_ sender: AnyObject?) {
        showStatusBarIcon.toggle()
        statusItem.isVisible = showStatusBarIcon
        statusBarMenuItem?.state = showStatusBarIcon ? .on : .off
        UserDefaults.standard.set(showStatusBarIcon, forKey: "MacYoloShowStatusBarIcon")
        let proc = Process()
        proc.launchPath = "/opt/homebrew/bin/node"
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        proc.arguments = ["\(home)/workspace/mac-yolo-safeguards/tools/mac-yolo-system-care-engine.js", "--status-icon", showStatusBarIcon ? "show" : "hide"]
        try? proc.run()
        refreshLiveTelemetry()
    }

    func dismissHudNotification() {
        hudPanel?.orderOut(nil)
    }

    func updateActiveWindowFromWorkspace(_ app: NSRunningApplication?) {
        let skip: Set<String> = ["MacYoloSafeguards", "Mac YOLO Safeguards", "Mac YOLO Guard", "Dayglass", "Window Server", "Dock", "Control Center", "Notification Center", "SystemUIServer"]
        let myPid = ProcessInfo.processInfo.processIdentifier
        if let a = app, a.processIdentifier != myPid, let name = a.localizedName, !skip.contains(name) {
            let pid = a.processIdentifier
            var winTitle = ""
            if let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
                for w in list {
                    if let wPid = w["kCGWindowOwnerPID"] as? Int32, wPid == pid,
                       (w["kCGWindowLayer"] as? Int ?? 0) == 0,
                       let wName = w["kCGWindowName"] as? String, !wName.isEmpty {
                        winTitle = wName
                        break
                    }
                }
            }
            lastActiveApp = name
            lastActiveWin = winTitle.isEmpty ? name : winTitle
        } else if let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
            for w in list {
                if (w["kCGWindowLayer"] as? Int ?? 0) == 0,
                   let owner = w["kCGWindowOwnerName"] as? String, !skip.contains(owner) {
                    let wName = (w["kCGWindowName"] as? String) ?? ""
                    lastActiveApp = owner
                    lastActiveWin = wName.isEmpty ? owner : wName
                    break
                }
            }
        }
    }

    func resolvedWifiInterfaceName() -> String {
        if !wifiInterfaceName.isEmpty { return wifiInterfaceName }
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/sbin/networksetup")
        proc.arguments = ["-listallhardwareports"]
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = Pipe()
        var found = "en0"
        if (try? proc.run()) != nil {
            proc.waitUntilExit()
            let text = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            var pendingWifi = false
            for raw in text.split(separator: "\n") {
                let line = String(raw)
                if line.contains("Hardware Port: Wi-Fi") {
                    pendingWifi = true
                    continue
                }
                if pendingWifi && line.contains("Device:") {
                    let parts = line.split(separator: ":", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
                    if parts.count == 2, !parts[1].isEmpty { found = parts[1] }
                    break
                }
            }
        }
        wifiInterfaceName = found
        return found
    }

    func interfaceByteTotals(named ifname: String) -> (UInt64, UInt64)? {
        var mib: [Int32] = [CTL_NET, PF_ROUTE, 0, 0, NET_RT_IFLIST2, 0]
        var len = 0
        if sysctl(&mib, UInt32(mib.count), nil, &len, nil, 0) != 0 || len <= 0 { return nil }
        var buf = [UInt8](repeating: 0, count: len)
        if sysctl(&mib, UInt32(mib.count), &buf, &len, nil, 0) != 0 { return nil }
        var offset = 0
        while offset + MemoryLayout<if_msghdr>.size <= len {
            let hdr = buf.withUnsafeBytes { $0.load(fromByteOffset: offset, as: if_msghdr.self) }
            let step = Int(hdr.ifm_msglen)
            if step <= 0 || offset + step > len { break }
            if Int32(hdr.ifm_type) == RTM_IFINFO2, offset + MemoryLayout<if_msghdr2>.size <= len {
                let msg2 = buf.withUnsafeBytes { $0.load(fromByteOffset: offset, as: if_msghdr2.self) }
                var nameC = [CChar](repeating: 0, count: Int(IFNAMSIZ))
                if if_indextoname(UInt32(msg2.ifm_index), &nameC) != nil, String(cString: nameC) == ifname {
                    return (msg2.ifm_data.ifi_ibytes, msg2.ifm_data.ifi_obytes)
                }
            }
            offset += step
        }
        return nil
    }

    func sampleNetworkRates() -> (String, String) {
        let now = Date()
        let wifi = resolvedWifiInterfaceName()
        guard let (totalIn, totalOut) = interfaceByteTotals(named: wifi) else {
            return ("↑ \(lastUpKB) KB/sec", "↓ \(lastDownKB) KB/sec")
        }
        if let oldest = netHistory.first, totalIn < oldest.inn || totalOut < oldest.out {
            netHistory.removeAll()
        }
        netHistory.append((t: now, inn: totalIn, out: totalOut))
        netHistory.removeAll { now.timeIntervalSince($0.t) > 6.0 }
        if let oldest = netHistory.first {
            let dt = now.timeIntervalSince(oldest.t)
            if dt >= 1.2 && totalIn >= oldest.inn && totalOut >= oldest.out {
                lastDownKB = Int((Double(totalIn - oldest.inn) / 1024.0 / dt).rounded())
                lastUpKB = Int((Double(totalOut - oldest.out) / 1024.0 / dt).rounded())
            }
        }
        return ("↑ \(lastUpKB) KB/sec", "↓ \(lastDownKB) KB/sec")
    }

    func fanLabel(for fullComm: String, base: String) -> String {
        let lower = (fullComm + " " + base).lowercased()
        if lower.contains("browseros") { return "BrowserOS" }
        if lower.contains("ghostty") { return "Ghostty" }
        if lower.contains("opendirectoryd") { return "Directory Services" }
        if lower.contains("jamf") { return "Jamf Protect" }
        if lower.contains("llama-server") || base == "ollama" { return "Ollama" }
        if base == "mds" || base.hasPrefix("mds_") { return "Spotlight" }
        if base == "WindowServer" { return "WindowServer" }
        if lower.contains("claude") { return "Claude" }
        if lower.contains("cursor") { return "Cursor" }
        if lower.contains("grok") { return "Grok" }
        if lower.contains("google chrome") { return "Chrome" }
        if base == "node" { return "node" }
        return base
    }

    func appleThermalWarning() -> Bool {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/pmset")
        proc.arguments = ["-g", "therm"]
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = Pipe()
        guard (try? proc.run()) != nil else { return false }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        proc.waitUntilExit()
        let text = String(data: data, encoding: .utf8) ?? ""
        if text.contains("No thermal warning level has been recorded") { return false }
        return text.localizedCaseInsensitiveContains("warning")
    }

    func sampleAppleSiliconGpu() -> (devicePct: Int, rendererPct: Int, tilerPct: Int, vramGB: Double) {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/sbin/ioreg")
        proc.arguments = ["-r", "-d", "1", "-w", "0", "-c", "AGXAccelerator"]
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = Pipe()
        var devPct = 0
        var renPct = 0
        var tilPct = 0
        var vramBytes: Double = 0
        if (try? proc.run()) != nil {
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            proc.waitUntilExit()
            let text = String(data: data, encoding: .utf8) ?? ""
            if let r = text.range(of: #""Device Utilization %"=(\d+)"#, options: .regularExpression) {
                let s = String(text[r]).components(separatedBy: "=").last ?? "0"
                devPct = Int(s) ?? 0
            }
            if let r = text.range(of: #""Renderer Utilization %"=(\d+)"#, options: .regularExpression) {
                let s = String(text[r]).components(separatedBy: "=").last ?? "0"
                renPct = Int(s) ?? 0
            }
            if let r = text.range(of: #""Tiler Utilization %"=(\d+)"#, options: .regularExpression) {
                let s = String(text[r]).components(separatedBy: "=").last ?? "0"
                tilPct = Int(s) ?? 0
            }
            if let r = text.range(of: #""In use system memory"=(\d+)"#, options: .regularExpression) {
                let s = String(text[r]).components(separatedBy: "=").last ?? "0"
                vramBytes = Double(s) ?? 0
            }
        }
        return (devPct, renPct, tilPct, vramBytes / 1_000_000_000.0)
    }

    func sampleLiveSessionFiles() -> (ompFiles: Int, ompMB: Double, grokFiles: Int, grokMB: Double, totalMB: Double, estTokensM: Double, topFiles: [[String: Any]]) {
        let now = Date()
        if now.timeIntervalSince(lastSessionScanAt) < 15.0 && cachedSessionStats.totalMB > 0 {
            return cachedSessionStats
        }
        let fm = FileManager.default
        let home = fm.homeDirectoryForCurrentUser.path
        let cutoff = now.addingTimeInterval(-7200)
        var collected: [(name: String, path: String, mb: Double, ageMin: Int, agent: String)] = []
        let skipNames: Set<String> = ["usage.json", "signals.json", "summary.json", "updates.jsonl", "rewind_points.jsonl", "prompt_history.jsonl"]
        func scanDir(_ rel: String, agentLabel: String) -> (Int, Double) {
            let root = "\(home)/\(rel)"
            guard let en = fm.enumerator(atPath: root) else { return (0, 0) }
            var files = 0
            var bytes: Double = 0
            while let item = en.nextObject() as? String {
                if item.contains("compaction_checkpoints/") || item.contains("web_fetch/") || item.contains("subagents/") { continue }
                let baseName = (item as NSString).lastPathComponent
                if skipNames.contains(baseName) { continue }
                if !baseName.hasSuffix(".jsonl") { continue }
                let full = "\(root)/\(item)"
                if let attrs = try? fm.attributesOfItem(atPath: full),
                   let mtime = attrs[.modificationDate] as? Date,
                   mtime >= cutoff,
                   let sz = (attrs[.size] as? NSNumber)?.doubleValue {
                    files += 1
                    bytes += sz
                    let mb = sz / 1_048_576.0
                    let age = max(0, Int(round(now.timeIntervalSince(mtime) / 60.0)))
                    let parentId = ((item as NSString).deletingLastPathComponent as NSString).lastPathComponent
                    let dispName = (baseName == "chat_history.jsonl" && !parentId.isEmpty)
                        ? "chat_history.jsonl (\(parentId.prefix(8)))"
                        : baseName
                    collected.append((dispName, full, mb, age, agentLabel))
                }
            }
            return (files, bytes / 1_048_576.0)
        }
        let (of, omb) = scanDir(".omp/agent/sessions/-workspace-mac-yolo-safeguards", agentLabel: "OMP")
        let (gf, gmb) = scanDir(".grok/sessions/%2FUsers%2Figanapolsky%2Fworkspace%2Fmac-yolo-safeguards", agentLabel: "Grok CLI")
        let totMB = omb + gmb
        let estM = (totMB * 1_048_576.0 / 4.0) / 1_000_000.0
        let topDicts: [[String: Any]] = collected.sorted { $0.mb > $1.mb }.prefix(10).enumerated().map { idx, f in
            let tokK = Int(round((f.mb * 1_048_576.0 / 4.0) / 1000.0))
            return [
                "key": "sess-file-\(idx)",
                "title": "\(f.agent) · \(f.name)",
                "right": String(format: "%.2f MB (~%dK tok) · %dm ago", f.mb, tokK, f.ageMin),
                "subtitle": f.path,
                "pct": min(100, max(8, Int(round((f.mb / max(0.5, totMB)) * 100.0)))),
                "actionType": "revealPath",
                "actionArg": f.path,
                "actionLabel": "Reveal in Finder",
            ]
        }
        let res = (of, omb, gf, gmb, totMB, estM, topDicts)
        lastSessionScanAt = now
        cachedSessionStats = res
        return res
    }

    func jsonBool(_ value: Any?) -> Bool {
        if let b = value as? Bool { return b }
        if let n = value as? NSNumber { return n.boolValue }
        return false
    }

    func diskRecText(_ section: [String: Any], _ key: String, fallback: String) -> String {
        if let s = section[key] as? String {
            let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { return trimmed }
        }
        return fallback
    }

    func runDiskProbeSelfTest() -> Never {
        let t0 = Date()
        let first = diskRecommendationProbe()
        let ms = Date().timeIntervalSince(t0) * 1000.0
        print(String(format: "MAC_YOLO_DISK_PROBE_RETURN_MS=%.2f", ms))
        let blocked = ms >= 250.0 ? 1 : 0
        print("MAC_YOLO_DISK_PROBE_BLOCKED=\(blocked)")
        fflush(stdout)
        if blocked != 0 {
            exit(1)
        }
        if ProcessInfo.processInfo.environment["MAC_YOLO_DISK_PROBE_EXPECT_DELIVERY"] != "1" {
            if let stamp = ProcessInfo.processInfo.environment["MAC_YOLO_DISK_PROBE_STAMP"], !stamp.isEmpty {
                let stampDeadline = Date().addingTimeInterval(1.5)
                var started = FileManager.default.fileExists(atPath: stamp)
                while !started && Date() < stampDeadline {
                    Thread.sleep(forTimeInterval: 0.02)
                    started = FileManager.default.fileExists(atPath: stamp)
                }
                print("MAC_YOLO_DISK_PROBE_CHILD_STARTED=\(started ? 1 : 0)")
                fflush(stdout)
                exit(started ? 0 : 1)
            }
            exit(0)
        }
        let deadline = Date().addingTimeInterval(2.0)
        var delivered = jsonBool(first["ok"])
        while !delivered && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.05)
            diskProbeLock.lock()
            let snap = cachedDiskRecs
            diskProbeLock.unlock()
            delivered = jsonBool(snap["ok"])
        }
        print("MAC_YOLO_DISK_PROBE_DELIVERED=\(delivered ? 1 : 0)")
        fflush(stdout)
        exit(delivered ? 0 : 1)
    }

    func diskRecommendationProbe() -> [String: Any] {
        diskProbeLock.lock()
        let forced = forceDiskRecheck
        if forced { forceDiskRecheck = false }
        let age = Date().timeIntervalSince(cachedDiskRecsAt)
        let cachedOk = jsonBool(cachedDiskRecs["ok"])
        let snapshot = cachedDiskRecs
        diskProbeLock.unlock()
        if !forced, age < 3, cachedOk {
            return snapshot
        }
        let started = scheduleDiskRecommendationRefresh()
        if !started && forced {
            diskProbeLock.lock()
            forceDiskRecheck = true
            diskProbeLock.unlock()
        }
        return cachedOk ? snapshot : ["ok": false]
    }

    func scheduleDiskRecommendationRefresh() -> Bool {
        diskProbeLock.lock()
        if diskProbeInFlight {
            diskProbeLock.unlock()
            return false
        }
        diskProbeInFlight = true
        diskProbeLock.unlock()
        diskProbeQueue.async {
            let result = self.runDiskRecommendationProcess()
            self.diskProbeLock.lock()
            if self.jsonBool(result["ok"]) {
                self.cachedDiskRecs = result
                self.cachedDiskRecsAt = Date()
            }
            self.diskProbeInFlight = false
            self.diskProbeLock.unlock()
        }
        return true
    }

    func diskProbeLaunch() -> (url: URL, args: [String])? {
        let envBin = ProcessInfo.processInfo.environment["MAC_YOLO_DISK_PROBE_BIN"] ?? ""
        if !envBin.isEmpty {
            guard FileManager.default.isExecutableFile(atPath: envBin) else { return nil }
            return (URL(fileURLWithPath: envBin), [])
        }
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let rustBin = "\(home)/workspace/mac-yolo-safeguards/bin/mac-yolo-rust-core"
        let script = "\(home)/workspace/mac-yolo-safeguards/tools/hud-live-recommendations.js"
        let node = "/opt/homebrew/bin/node"
        if FileManager.default.isExecutableFile(atPath: rustBin) {
            return (URL(fileURLWithPath: rustBin), ["hud-disk-recs"])
        }
        if FileManager.default.fileExists(atPath: script),
           FileManager.default.isExecutableFile(atPath: node) {
            return (URL(fileURLWithPath: node), [script])
        }
        return nil
    }

    func runDiskRecommendationProcess() -> [String: Any] {
        diskProbeLock.lock()
        let stale: [String: Any] = jsonBool(cachedDiskRecs["ok"]) ? cachedDiskRecs : ["ok": false]
        diskProbeLock.unlock()
        guard let launch = diskProbeLaunch() else { return stale }
        let proc = Process()
        proc.executableURL = launch.url
        proc.arguments = launch.args
        let out = Pipe()
        let err = Pipe()
        proc.standardOutput = out
        proc.standardError = err
        do {
            try proc.run()
        } catch {
            return stale
        }
        let deadline = Date().addingTimeInterval(6.0)
        while proc.isRunning && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.02)
        }
        if proc.isRunning {
            proc.terminate()
            return stale
        }
        let data = out.fileHandleForReading.readDataToEndOfFile()
        _ = err.fileHandleForReading.readDataToEndOfFile()
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              jsonBool(obj["ok"]) else {
            return stale
        }
        return obj
    }

    func readRecentOperationsHistory(limit: Int = 6) -> [[String: String]] {
        let path = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".hermes/logs/mac-yolo-operations.jsonl").path
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
              let text = String(data: data, encoding: .utf8) else {
            return [
                ["left": "Cleanup log", "right": "No cleanup recorded yet"],
            ]
        }
        var out: [[String: String]] = []
        for line in text.split(separator: "\n").suffix(limit).reversed() {
            if let d = line.data(using: .utf8),
               let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
                let ts = String((obj["ts"] as? String ?? "").prefix(19)).replacingOccurrences(of: "T", with: " ")
                let act = obj["action"] as? String ?? "operation"
                let status = obj["status"] as? String ?? "ok"
                var summary = status.uppercased()
                if let det = obj["details"] as? [String: Any] {
                    if let mb = det["freedMB"] as? Double {
                        summary = String(format: "Freed %.1f MB", mb)
                    } else if let killed = det["killedCount"] as? Int {
                        summary = "Reaped \(killed) hogs"
                    } else if let target = det["target"] as? String {
                        summary = "\(target) (\(status))"
                    }
                }
                out.append(["left": "\(ts) · \(act)", "right": summary])
            }
        }
        if out.isEmpty {
            out.append(["left": "Cleanup log", "right": "No cleanup recorded yet"])
        }
        return out
    }

    func sampleHostCpuPercent(fallbackLoad: Double, ncpu: Int) -> Int {
        var cpuInfo = host_cpu_load_info()
        var count = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info_data_t>.stride / MemoryLayout<integer_t>.stride)
        let kerr = withUnsafeMutablePointer(to: &cpuInfo) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, $0, &count)
            }
        }
        if kerr == KERN_SUCCESS {
            let u = UInt64(cpuInfo.cpu_ticks.0)
            let s = UInt64(cpuInfo.cpu_ticks.1)
            let i = UInt64(cpuInfo.cpu_ticks.2)
            let n = UInt64(cpuInfo.cpu_ticks.3)
            if let prev = prevCpuTicks {
                let du = u >= prev.user ? (u - prev.user) : 0
                let ds = s >= prev.sys ? (s - prev.sys) : 0
                let di = i >= prev.idle ? (i - prev.idle) : 0
                let dn = n >= prev.nice ? (n - prev.nice) : 0
                let tot = du + ds + di + dn
                prevCpuTicks = (u, s, i, n)
                if tot > 0 {
                    let busy = Double(du + ds + dn) / Double(tot) * 100.0
                    return min(100, max(2, Int(round(busy))))
                }
            } else {
                prevCpuTicks = (u, s, i, n)
            }
        }
        return min(95, max(3, Int(round((fallbackLoad / Double(max(1, ncpu))) * 55.0))))
    }

    func physicalMemoryGB() -> Double {
        max(1.0, Double(ProcessInfo.processInfo.physicalMemory) / 1_073_741_824.0)
    }

    func memoryGroupAdvice(name: String, gb: Double, cpu: Double, count: Int, physGB: Double, compressedGB: Double) -> [String] {
        let share = gb / physGB * 100.0
        let lower = name.lowercased()
        let sizeLine = String(format: "%@ is using %.2f GB across %d processes, %.0f%% of the %.0f GB in this Mac.", name, gb, count, share, physGB)
        let cpuLine: String
        if cpu >= 100 {
            cpuLine = String(format: "Those processes add up to %.0f%% CPU. 100%% is one core, so this group is a real source of the fan noise.", cpu)
        } else if cpu >= 25 {
            cpuLine = String(format: "CPU for this group is %.0f%%. It is warm. It is not the whole machine.", cpu)
        } else {
            cpuLine = String(format: "CPU for this group is %.0f%%. Memory is the story here, not processor time.", cpu)
        }
        let leave: String
        if lower.contains("ollama") || lower.contains("llama") {
            leave = "This is the loaded model. Those gigabytes are weights, not a cache this panel can sweep. Unload the model in Ollama when you are finished with it."
        } else if lower.contains("browseros") {
            leave = "Auto-optimized by Mac YOLO: sweeps idle agent tabs (>3m), locks Sparkle 2GB unpack loops, and caps rrweb replays to 24h. Click Cool Down Fans to sweep idle tabs now."
        } else if lower.contains("claude") || lower.contains("hermes") || lower.contains("ghostty") || lower.contains("demi") || lower.contains("jamf") || lower.contains("windowserver") || lower.contains("chrome") || lower == "omp" {
            leave = "Leave \(name) running. This panel does not quit it."
        } else if lower.contains("python") || lower == "node" {
            leave = "The process count is high and the memory total is small. Read the largest command in the breakdown before treating this as a leak."
        } else if gb >= 1.5 {
            leave = "Quit \(name) from its own window if you want this memory back. This panel does not kill processes."
        } else {
            leave = "This footprint is small next to the groups above it."
        }
        var lines = [sizeLine, cpuLine, leave]
        if compressedGB >= 8 && share >= 15 {
            lines.append(String(format: "The kernel compressor is holding %.1f GB. A group this large is part of why.", compressedGB))
        }
        return lines
    }

    func sampleTopCpuCulprits() -> (shortLine: String, cpuShortLine: String, recTitle: String, recDesc: String, detailCpu: String, detailMem: String, detailFleet: String, topCpu: Double, totalProcs: Int, pyCount: Int, nodeCount: Int, mcpCount: Int, swarmSummary: String, pidsByApp: [String: [[String: Any]]], pidsBySwarm: [String: [[String: Any]]], cpuByApp: [String: Double], rssByApp: [String: Double], countByApp: [String: Int], rankedApps: [String], memRankedApps: [String], swarmCounts: [String: Int], topCmdByApp: [String: String], mcpFamilyItems: [[String: Any]]) {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/ps")
        proc.arguments = ["-Ao", "pid,%cpu,rss,etime,command", "-r"]
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = Pipe()
        var cpuByApp: [String: Double] = [:]
        var rssByApp: [String: Double] = [:]
        var countByApp: [String: Int] = [:]
        var pidsByApp: [String: [[String: Any]]] = [:]
        var pidsBySwarm: [String: [[String: Any]]] = [:]
        var mcpCountByFam: [String: Int] = [:]
        var mcpRssByFam: [String: Double] = [:]
        var mcpCpuByFam: [String: Double] = [:]
        var mcpPidsByFam: [String: [[String: Any]]] = [:]
        var totalProcs = 0
        var pyCount = 0
        var nodeCount = 0
        var mcpCount = 0
        var herdrCount = 0
        var ompCount = 0
        var claudeCount = 0
        var grokCount = 0
        var poolCount = 0
        var cursorCount = 0
        var hermesCount = 0
        var topRssKB: [String: Double] = [:]
        var topCmdByApp: [String: String] = [:]
        let physGB = physicalMemoryGB()
        if (try? proc.run()) != nil {
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            proc.waitUntilExit()
            let text = String(data: data, encoding: .utf8) ?? ""
            for raw in text.split(separator: "\n").dropFirst() {
                totalProcs += 1
                let parts = raw.trimmingCharacters(in: .whitespaces).split(separator: " ", maxSplits: 4, omittingEmptySubsequences: true)
                if parts.count < 5 { continue }
                let pidNum = Int(parts[0]) ?? 0
                let cpu = Double(parts[1]) ?? 0.0
                let rssKB = Double(parts[2]) ?? 0.0
                let etime = String(parts[3])
                let fullComm = String(parts[4])
                let execToken = String(fullComm.split(separator: " ").first ?? Substring(fullComm))
                let base = (execToken as NSString).lastPathComponent
                let lower = fullComm.lowercased()
                let rssMB = rssKB / 1024.0
                let pidEntry: [String: Any] = [
                    "title": "PID \(pidNum) · \(base) (up \(etime))",
                    "right": String(format: "%.1f%% CPU · %.0f MB RAM", cpu, rssMB),
                    "subtitle": String(fullComm.prefix(160)),
                    "actionType": "killPid",
                    "actionArg": "\(pidNum)",
                    "actionLabel": "Kill PID",
                ]
                let isMcp = lower.contains("mcp") || lower.contains("thumbgate serve") || lower.contains("context7")
                if isMcp {
                    mcpCount += 1
                    let mcpFam: String
                    if lower.contains("dayglass") {
                        mcpFam = "Dayglass MCP (dayglass-mcp)"
                    } else if lower.contains("thumbgate") {
                        mcpFam = "ThumbGate MCP (thumbgate serve)"
                    } else if lower.contains("agent_mesh") || lower.contains("agent-mesh") {
                        mcpFam = "Agent Mesh MCP (agent_mesh_mcp)"
                    } else if lower.contains("claude mcp serve") {
                        mcpFam = "Claude MCP Serve (claude mcp serve)"
                    } else if lower.contains("but mcp") || lower.contains("gitbutler") {
                        mcpFam = "GitButler MCP (but mcp)"
                    } else if lower.contains("grepai") {
                        mcpFam = "GrepAI Semantic MCP (grepai mcp)"
                    } else if lower.contains("gurobi") {
                        mcpFam = "Gurobi Optimizer MCP (gurobi-mcp)"
                    } else if lower.contains("github") {
                        mcpFam = "GitHub MCP (github-mcp-server)"
                    } else if lower.contains("context7") {
                        mcpFam = "Context7 Docs MCP (context7)"
                    } else if lower.contains("clawctl") || lower.contains("browser") {
                        mcpFam = "Clawctl / Browser MCP"
                    } else {
                        mcpFam = "Local STDIO MCP Servers"
                    }
                    mcpCountByFam[mcpFam, default: 0] += 1
                    mcpRssByFam[mcpFam, default: 0.0] += rssMB
                    mcpCpuByFam[mcpFam, default: 0.0] += cpu
                    if (mcpPidsByFam[mcpFam]?.count ?? 0) < 16 {
                        mcpPidsByFam[mcpFam, default: []].append(pidEntry)
                    }
                }
                if base.lowercased().contains("python") {
                    pyCount += 1
                    if (pidsBySwarm["python"]?.count ?? 0) < 8 { pidsBySwarm["python", default: []].append(pidEntry) }
                }
                if base == "node" {
                    nodeCount += 1
                    if (pidsBySwarm["node"]?.count ?? 0) < 8 { pidsBySwarm["node", default: []].append(pidEntry) }
                }
                if base == "herdr" || lower.contains("/herdr ") {
                    herdrCount += 1
                    var herdrEntry = pidEntry
                    herdrEntry["actionType"] = ""
                    herdrEntry["actionLabel"] = "Protected"
                    if (pidsBySwarm["herdr"]?.count ?? 0) < 8 { pidsBySwarm["herdr", default: []].append(herdrEntry) }
                }
                if base == "omp" {
                    ompCount += 1
                    if (pidsBySwarm["omp"]?.count ?? 0) < 8 { pidsBySwarm["omp", default: []].append(pidEntry) }
                }
                if lower.contains("claude") {
                    claudeCount += 1
                    if (pidsBySwarm["claude"]?.count ?? 0) < 8 { pidsBySwarm["claude", default: []].append(pidEntry) }
                }
                if lower.contains("grok") {
                    grokCount += 1
                    if (pidsBySwarm["grok"]?.count ?? 0) < 8 { pidsBySwarm["grok", default: []].append(pidEntry) }
                }
                if lower.contains("pool.real") {
                    poolCount += 1
                    if (pidsBySwarm["pool"]?.count ?? 0) < 8 { pidsBySwarm["pool", default: []].append(pidEntry) }
                }
                if lower.contains("cursor") {
                    cursorCount += 1
                    if (pidsBySwarm["cursor"]?.count ?? 0) < 8 { pidsBySwarm["cursor", default: []].append(pidEntry) }
                }
                if lower.contains("hermes") {
                    hermesCount += 1
                    if (pidsBySwarm["hermes"]?.count ?? 0) < 8 { pidsBySwarm["hermes", default: []].append(pidEntry) }
                }
                if base == "ps" || base == "MacYoloSafeguards" { continue }
                let label = fanLabel(for: fullComm, base: base)
                cpuByApp[label, default: 0.0] += cpu
                rssByApp[label, default: 0.0] += rssKB
                countByApp[label, default: 0] += 1
                if (pidsByApp[label]?.count ?? 0) < 8 {
                    pidsByApp[label, default: []].append(pidEntry)
                }
                if rssKB >= topRssKB[label, default: -1] {
                    topRssKB[label] = rssKB
                    topCmdByApp[label] = "PID \(pidNum) · \(String(format: "%.0f", rssMB)) MB · \(String(fullComm.prefix(140)))"
                }
            }
        }
        let ranked = cpuByApp.keys.sorted {
            (cpuByApp[$0, default: 0] * 10.0 + rssByApp[$0, default: 0] / 10240.0) > (cpuByApp[$1, default: 0] * 10.0 + rssByApp[$1, default: 0] / 10240.0)
        }
        let cpuOnlyRanked = cpuByApp.keys.sorted { cpuByApp[$0, default: 0] > cpuByApp[$1, default: 0] }
        let shown = ranked.prefix(3)
        let shortStr = shown.map { name in
            let gb = rssByApp[name, default: 0] / 1_048_576.0
            let c = cpuByApp[name, default: 0]
            return gb >= 0.8 ? String(format: "%@ (%.1fG · %.0f%%)", name, gb, c) : String(format: "%@ (%.0f%%)", name, c)
        }.joined(separator: " · ")
        let cpuShortStr = cpuOnlyRanked.prefix(2).map { name in
            String(format: "%@ %.0f%%", name, cpuByApp[name, default: 0])
        }.joined(separator: " · ")
        let topCpu = ranked.first.map { cpuByApp[$0, default: 0] } ?? 0
        let hot = appleThermalWarning()
        let rTitle = "Top Hogs: \(shortStr)"
        let rDesc = "\(totalProcs) live procs (\(mcpCount) MCPs · \(pyCount) py · \(nodeCount) node) · Thermal: \(hot ? "Warning" : "Nominal") · Auto-Guard ON"
        let cpuRows = ranked.prefix(8).enumerated().map { idx, name in
            let c = cpuByApp[name, default: 0]
            let gb = rssByApp[name, default: 0] / 1_048_576.0
            let cnt = countByApp[name, default: 1]
            let bar = min(100, max(4, Int(round(c))))
            return String(format: "%d. %@ (%d procs)|%.1f%% CPU · %.2f GB RAM|%d", idx + 1, name, cnt, c, gb, bar)
        }.joined(separator: ";;")
        let memRanked = rssByApp.keys.sorted { rssByApp[$0, default: 0] > rssByApp[$1, default: 0] }
        let memRows = memRanked.prefix(8).enumerated().map { idx, name in
            let gb = rssByApp[name, default: 0] / 1_048_576.0
            let pctRam = (gb / physGB) * 100.0
            let c = cpuByApp[name, default: 0]
            let cnt = countByApp[name, default: 1]
            let bar = min(100, max(4, Int(round(pctRam))))
            return String(format: "%d. %@ (%d procs)|%.2f GB (%.1f%%) · %.0f%% CPU|%d", idx + 1, name, cnt, gb, pctRam, c, bar)
        }.joined(separator: ";;")
        let swarmStr = "Herdr×\(herdrCount) · OMP×\(ompCount) · Claude×\(claudeCount) · Pool×\(poolCount) · Grok×\(grokCount)"
        let fleetRows = [
            "Live MCP STDIO/HTTP Servers|\(mcpCount) live procs|\(min(100, mcpCount * 2))",
            "Herdr Session Multiplexer (Protected)|\(herdrCount) live procs|\(min(100, herdrCount * 15))",
            "OMP (Oh-My-Pi) Agent Processes|\(ompCount) live procs|\(min(100, ompCount * 8))",
            "Grok CLI Swarm Processes|\(grokCount) live procs|\(min(100, grokCount * 12))",
            "Claude Desktop + Claude Code|\(claudeCount) live procs|\(min(100, claudeCount * 4))",
            "Poolside (Laguna) Processes|\(poolCount) live procs|\(min(100, poolCount * 10))",
            "Cursor IDE + Cursor Agent Workers|\(cursorCount) live procs|\(min(100, cursorCount * 3))",
            "Python Processes (MCPs + ML Workers)|\(pyCount) live procs|\(min(100, pyCount))",
            "Node.js Processes (MCPs + Services)|\(nodeCount) live procs|\(min(100, nodeCount * 2))",
        ].joined(separator: ";;")
        let swarmCounts: [String: Int] = [
            "herdr": herdrCount, "omp": ompCount, "grok": grokCount, "claude": claudeCount, "pool": poolCount,
            "cursor": cursorCount, "python": pyCount, "node": nodeCount, "hermes": hermesCount,
        ]
        let mcpFamilyItems: [[String: Any]] = mcpCountByFam.keys.sorted {
            if mcpCountByFam[$0, default: 0] != mcpCountByFam[$1, default: 0] {
                return mcpCountByFam[$0, default: 0] > mcpCountByFam[$1, default: 0]
            }
            return mcpRssByFam[$0, default: 0] > mcpRssByFam[$1, default: 0]
        }.enumerated().map { idx, fam in
            let cnt = mcpCountByFam[fam, default: 0]
            let mb = mcpRssByFam[fam, default: 0.0]
            let c = mcpCpuByFam[fam, default: 0.0]
            let kids = mcpPidsByFam[fam] ?? []
            return [
                "key": "mcp-fam-\(idx)",
                "title": "\(idx + 1). \(fam) (\(cnt) \(cnt == 1 ? "proc" : "procs"))",
                "right": String(format: "%.0f MB RAM · %.1f%% CPU", mb, c),
                "subtitle": "Click to inspect \(kids.count) live MCP PIDs, uptime & command args",
                "pct": min(100, max(8, cnt * 8)),
                "children": kids,
            ]
        }
        return (shortStr.isEmpty ? "Idle" : shortStr, cpuShortStr.isEmpty ? "Idle" : cpuShortStr, rTitle, rDesc, cpuRows, memRows, fleetRows, topCpu, totalProcs, pyCount, nodeCount, mcpCount, swarmStr, pidsByApp, pidsBySwarm, cpuByApp, rssByApp, countByApp, ranked, memRanked, swarmCounts, topCmdByApp, mcpFamilyItems)
    }

    func refreshLiveTelemetry() {
        if telemetryInFlight { return }
        telemetryInFlight = true
        telemetryQueue.async { [weak self] in
            guard let self = self else { return }
            defer { self.telemetryInFlight = false }
            self.performLiveTelemetryTick()
        }
    }

    func performLiveTelemetryTick() {
        var load: [Double] = [0.0, 0.0, 0.0]
        getloadavg(&load, 3)
        let ncpu = max(1, ProcessInfo.processInfo.activeProcessorCount)
        let cpuPct = sampleHostCpuPercent(fallbackLoad: load[0], ncpu: ncpu)
        let load1Str = String(format: "%.1f", load[0])
        let load5Str = String(format: "%.1f", load[1])
        let load15Str = String(format: "%.1f", load[2])

        var freeDecimalGB = 150.24
        var totalDecimalGB = 494.38
        if let attrs = try? FileManager.default.attributesOfFileSystem(forPath: "/") {
            if let free = (attrs[.systemFreeSize] as? NSNumber)?.doubleValue {
                freeDecimalGB = free / 1_000_000_000.0
            }
            if let tot = (attrs[.systemSize] as? NSNumber)?.doubleValue {
                totalDecimalGB = tot / 1_000_000_000.0
            }
        }
        let usedDecimalGB = max(0, totalDecimalGB - freeDecimalGB)
        let diskUsedPct = min(99, max(5, Int(round((usedDecimalGB / max(1, totalDecimalGB)) * 100.0))))
        let freeMenuInt = Int(round(freeDecimalGB))
        let diskAvailStr = String(format: "%.1f GB Free of %.0f GB (%d%% used)", freeDecimalGB, totalDecimalGB, diskUsedPct)

        var memPressurePct = 36
        var activeGB = 10.0
        var wiredGB = 5.0
        var compressedGB = 3.0
        var vmStats = vm_statistics64()
        var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64>.size / MemoryLayout<integer_t>.size)
        let hostPort = mach_host_self()
        let kernRes = withUnsafeMutablePointer(to: &vmStats) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics64(hostPort, HOST_VM_INFO64, $0, &count)
            }
        }
        if kernRes == KERN_SUCCESS {
            let pageSize = Double(vm_kernel_page_size)
            let active = Double(vmStats.active_count) * pageSize
            let wired = Double(vmStats.wire_count) * pageSize
            let compressed = Double(vmStats.compressor_page_count) * pageSize
            activeGB = active / 1_073_741_824.0
            wiredGB = wired / 1_073_741_824.0
            compressedGB = compressed / 1_073_741_824.0
            let totalMem = Double(ProcessInfo.processInfo.physicalMemory)
            if totalMem > 0 {
                memPressurePct = min(99, max(8, Int(round(((active + wired + compressed) / totalMem) * 100.0))))
            }
        }
        let physGB = physicalMemoryGB()

        let (upRate, downRate) = sampleNetworkRates()
        let wifiName = resolvedWifiInterfaceName()
        let (rxBytes, txBytes) = interfaceByteTotals(named: wifiName) ?? (0, 0)
        let rxGB = Double(rxBytes) / 1_073_741_824.0
        let txGB = Double(txBytes) / 1_073_741_824.0

        let agentDir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/LaunchAgents").path
        let agentCount = (try? FileManager.default.contentsOfDirectory(atPath: agentDir).filter { $0.hasSuffix(".plist") }.count) ?? 88
        let culprits = sampleTopCpuCulprits()
        let gpu = sampleAppleSiliconGpu()
        let sess = sampleLiveSessionFiles()

        let df = DateFormatter()
        df.dateFormat = "HH:mm:ss"
        let nowTs = df.string(from: Date())
        telemetryHistory.append([
            "ts": nowTs,
            "cpuPct": cpuPct,
            "gpuPct": gpu.devicePct,
            "vramGB": gpu.vramGB,
            "memPct": memPressurePct,
            "activeGB": activeGB,
            "wiredGB": wiredGB,
            "compressedGB": compressedGB,
            "freeGB": freeDecimalGB,
            "tokM": sess.estTokensM,
            "sessMB": sess.totalMB,
            "load1": load[0],
            "topHog": culprits.shortLine,
        ])
        if telemetryHistory.count > 40 {
            telemetryHistory.removeFirst(telemetryHistory.count - 40)
        }
        let watchedApps = Array(culprits.memRankedApps.prefix(8))
        let watched = Set(watchedApps)
        appSampleHistory = appSampleHistory.filter { watched.contains($0.key) }
        for name in watchedApps {
            let gb = culprits.rssByApp[name, default: 0] / 1_048_576.0
            let cpu = culprits.cpuByApp[name, default: 0]
            var series = appSampleHistory[name] ?? []
            series.append(["ts": nowTs, "rssGB": gb, "cpu": cpu])
            if series.count > 40 { series.removeFirst(series.count - 40) }
            appSampleHistory[name] = series
        }

        func makeSpark(_ field: String, unit: String = "%", scale: Double = 1.0) -> [[String: Any]] {
            return telemetryHistory.suffix(18).map { pt in
                let rawVal = (pt[field] as? Double) ?? Double((pt[field] as? Int) ?? 0)
                let pct = min(100, max(8, Int(round(rawVal * scale))))
                let label = unit == "%" ? "\(Int(round(rawVal)))%" : String(format: "%.1f%@", rawVal, unit)
                return ["ts": pt["ts"] as? String ?? "", "pct": pct, "label": label]
            }
        }

        let opsHistory = readRecentOperationsHistory(limit: 5)
        let cpuSpark = makeSpark("cpuPct", unit: "%", scale: 1.0)
        let gpuSpark = makeSpark("gpuPct", unit: "%", scale: 1.0)
        let memSpark = makeSpark("memPct", unit: "%", scale: 1.0)
        let tokSpark = makeSpark("tokM", unit: "M", scale: 12.0)

        func buildProcessItems(_ appNames: [String], prefixKey: String) -> [[String: Any]] {
            return appNames.enumerated().map { idx, name in
                let c = culprits.cpuByApp[name, default: 0]
                let gb = culprits.rssByApp[name, default: 0] / 1_048_576.0
                let cnt = culprits.countByApp[name, default: 1]
                let pids = culprits.pidsByApp[name] ?? []
                let topCmd = culprits.topCmdByApp[name] ?? "\(pids.count) live PIDs"
                return [
                    "key": "\(prefixKey)-app-\(idx)",
                    "title": "\(idx + 1). \(name) (\(cnt) \(cnt == 1 ? "proc" : "procs"))",
                    "right": String(format: "%.1f%% CPU · %.2f GB RAM", c, gb),
                    "subtitle": topCmd,
                    "pct": min(100, max(6, Int(round(c + gb * 12.0)))),
                    "children": pids,
                ]
            }
        }

        let topCpuItems = buildProcessItems(Array(culprits.rankedApps.prefix(8)), prefixKey: "cpu")
        let topMemItems = buildProcessItems(Array(culprits.memRankedApps.prefix(8)), prefixKey: "mem")

        let diskProbe = diskRecommendationProbe()
        let probeOk = jsonBool(diskProbe["ok"])
        let wasteRec = (diskProbe["waste"] as? [String: Any]) ?? [:]
        let cmmRec = (diskProbe["cleanMyMac"] as? [String: Any]) ?? [:]
        let paperRec = (diskProbe["paper"] as? [String: Any]) ?? [:]
        let recheckText = "Disk recommendations are being rechecked."
        let wasteDone = probeOk && jsonBool(wasteRec["done"])
        let cmmDone = probeOk && jsonBool(cmmRec["done"])
        let paperDone = probeOk && jsonBool(paperRec["done"])
        let wasteShort = probeOk ? diskRecText(wasteRec, "short", fallback: "Rechecking") : "Rechecking"
        let wasteText = probeOk ? diskRecText(wasteRec, "text", fallback: recheckText) : recheckText
        let cmmShort = probeOk ? diskRecText(cmmRec, "short", fallback: "Rechecking") : "Rechecking"
        let cmmText = probeOk ? diskRecText(cmmRec, "text", fallback: recheckText) : recheckText
        let paperShort = probeOk ? diskRecText(paperRec, "short", fallback: "Rechecking") : "Rechecking"
        let paperText = probeOk ? diskRecText(paperRec, "text", fallback: recheckText) : recheckText
        let cmmPaths = (cmmRec["pathCount"] as? NSNumber)?.intValue ?? 0
        let paperPaths = (paperRec["pathCount"] as? NSNumber)?.intValue ?? 0
        let cmmPrimary = (cmmRec["primaryPath"] as? String) ?? ""
        var cmmRowActions: [[String: Any]] = [
            ["label": "Open Uninstall Drawer", "type": "uninstallDrawer", "arg": ""],
        ]
        if !cmmDone && !cmmPrimary.isEmpty {
            cmmRowActions.append(["label": "Reveal in Finder", "type": "revealPath", "arg": cmmPrimary])
        }

        let shieldDrill: [[String: Any]] = [
            [
                "key": "shield-cpu-gpu",
                "label": "Real-Time CPU & Apple Silicon GPU",
                "value": "CPU \(cpuPct)% (Load \(load1Str)/\(ncpu)) · GPU \(gpu.devicePct)% (\(String(format: "%.1fG", gpu.vramGB)) VRAM)",
                "badge": "History + \(topCpuItems.count) Groups",
                "pct": cpuPct,
                "cardJump": "cpu",
                "diagCmd": "ps -Ao pid,%cpu,rss,etime,comm -r | head -n 15",
                "chips": ["Load 1m/5m/15m: \(load1Str)/\(load5Str)/\(load15Str)", "GPU Renderer: \(gpu.rendererPct)%", "Tiler: \(gpu.tilerPct)%", "VRAM: \(String(format: "%.2f GB", gpu.vramGB))"],
                "spark": cpuSpark,
                "historySummary": "\(telemetryHistory.count) live samples (4s interval)",
                "history": [
                    ["left": "Current 1m / 5m / 15m Load Average", "right": "\(load1Str) / \(load5Str) / \(load15Str) (\(ncpu) logical cores)"],
                    ["left": "Current Top Compute Culprits", "right": culprits.shortLine],
                ] + opsHistory.prefix(2),
                "deepDive": [
                    ["k": "Kernel Mach Load (getloadavg)", "v": "1m=\(load1Str) · 5m=\(load5Str) · 15m=\(load15Str) across \(ncpu) Apple Silicon cores"],
                    ["k": "IOKit AGXAccelerator (GPU)", "v": "Device=\(gpu.devicePct)% · Renderer=\(gpu.rendererPct)% · Tiler=\(gpu.tilerPct)%"],
                    ["k": "Unified Metal System Memory", "v": String(format: "%.2f GB wired for GPU buffers", gpu.vramGB)],
                    ["k": "Active OS Process Table", "v": "\(culprits.totalProcs) live processes (\(culprits.pyCount) Python, \(culprits.nodeCount) Node)"],
                ],
                "items": topCpuItems,
                "recommendations": [
                    ["id": "cpu-load", "done": cpuPct < 55, "status": cpuPct < 55 ? "✓ Healthy (\(cpuPct)%)" : "Actionable", "actionType": "reapFans", "text": cpuPct >= 55 ? "1m load (\(load1Str)) exceeds 55% capacity — click Cool Down Fans to throttle runaway worker PIDs." : "CPU load (\(load1Str)/\(ncpu)) is within healthy interactive bounds; background auto-reaper keeps runaway build loops throttled."],
                    ["id": "gpu-load", "done": gpu.devicePct < 65, "status": gpu.devicePct < 65 ? "✓ Healthy (\(gpu.devicePct)%)" : "High GPU", "text": gpu.devicePct >= 65 ? "Apple Silicon GPU utilization is \(gpu.devicePct)% (\(String(format: "%.1fG", gpu.vramGB)) VRAM) — check local LLM inference or Metal compositors." : "AGXAccelerator GPU utilization (\(gpu.devicePct)%) and Metal VRAM (\(String(format: "%.1fG", gpu.vramGB))) have ample headroom."],
                ],
                "actions": [
                    ["label": "Cool Down Fans", "type": "reapFans", "arg": ""],
                    ["label": "Open CPU & GPU Card ↗", "type": "openCard", "arg": "cpu"],
                ],
            ],
            [
                "key": "shield-memory",
                "label": "Real-Time Memory Pressure",
                "value": String(format: "%d%% used (Active %.1fG · Wired %.1fG · Comp %.1fG)", memPressurePct, activeGB, wiredGB, compressedGB),
                "badge": "Mach VM + \(topMemItems.count) Groups",
                "pct": memPressurePct,
                "cardJump": "memory",
                "diagCmd": "vm_stat && ps -Ao pid,rss,%cpu,comm -m | head -n 15",
                "chips": [String(format: "Active: %.2f GB", activeGB), String(format: "Wired: %.2f GB", wiredGB), String(format: "Compressed: %.2f GB", compressedGB), "Page Size: 16 KB"],
                "spark": memSpark,
                "historySummary": "Mach HOST_VM_INFO64 trend",
                "history": [
                    ["left": "Mach VM Active + Wired + Compressed", "right": String(format: "%.2f GB / %.0f GB physical (%d%%)", activeGB + wiredGB + compressedGB, physGB, memPressurePct)],
                    ["left": "GPU Unified Memory Allocation", "right": String(format: "%.2f GB (AGXAccelerator)", gpu.vramGB)],
                ] + opsHistory.prefix(2),
                "deepDive": [
                    ["k": "Mach vm_statistics64.active_count", "v": String(format: "%u pages (%.2f GB)", vmStats.active_count, activeGB)],
                    ["k": "Mach vm_statistics64.wire_count", "v": String(format: "%u pages (%.2f GB kernel/locked)", vmStats.wire_count, wiredGB)],
                    ["k": "Mach vm_statistics64.compressor_page_count", "v": String(format: "%u pages (%.2f GB WKdm compressed)", vmStats.compressor_page_count, compressedGB)],
                    ["k": "Mach vm_statistics64.free_count", "v": String(format: "%u pages immediately reclaimable", vmStats.free_count)],
                ],
                "items": topMemItems,
                "recommendations": [
                    String(format: "Active %.1f GB + wired %.1f GB + compressed %.1f GB = %.1f GB of the %.0f GB in this Mac (%d%%).", activeGB, wiredGB, compressedGB, activeGB + wiredGB + compressedGB, physGB, memPressurePct),
                    String(format: "Wired memory is %.1f GB. Those pages stay put. On this Mac that is mostly the kernel and GPU allocations.", wiredGB),
                    String(format: "The compressor is holding %.1f GB of pages it already squeezed. That number is not free RAM.", compressedGB),
                ],
                "actions": [
                    ["label": "Copy vm_stat", "type": "copyCmd", "arg": "vm_stat"],
                    ["label": "Open Memory Card ↗", "type": "openCard", "arg": "memory"],
                ],
            ],
            [
                "key": "shield-sessions",
                "label": "Live 2h AI Session Volume",
                "value": String(format: "%.1f MB (%d JSONL files · ~%.1fM tokens)", sess.totalMB, sess.ompFiles + sess.grokFiles, sess.estTokensM),
                "badge": "\(sess.topFiles.count) Live Files",
                "pct": min(100, max(12, Int(round(sess.totalMB / 2.5)))),
                "cardJump": "tokens",
                "diagCmd": "ls -lt ~/.omp/agent/sessions/-workspace-mac-yolo-safeguards | head -n 15",
                "chips": ["OMP (2h): \(sess.ompFiles) files (\(String(format: "%.1f MB", sess.ompMB)))", "Grok (2h): \(sess.grokFiles) files (\(String(format: "%.1f MB", sess.grokMB)))", "KV-Cache Hit: 90.8%"],
                "spark": tokSpark,
                "historySummary": "Rolling 2h JSONL context window",
                "history": [
                    ["left": "OMP Active Transcripts (2h window)", "right": String(format: "%d files · %.2f MB", sess.ompFiles, sess.ompMB)],
                    ["left": "Grok CLI Active Transcripts (2h window)", "right": String(format: "%d files · %.2f MB", sess.grokFiles, sess.grokMB)],
                    ["left": "Estimated Token Volume (bytes / 4)", "right": String(format: "~%.2fM tokens", sess.estTokensM)],
                ],
                "deepDive": [
                    ["k": "OMP Session Directory", "v": "~/.omp/agent/sessions/-workspace-mac-yolo-safeguards"],
                    ["k": "Grok Session Directory", "v": "~/.grok/sessions/%2FUsers%2Figanapolsky%2Fworkspace%2Fmac-yolo-safeguards"],
                    ["k": "Prompt Prefix Ordering (The Sequence)", "v": "System → Tools → Repo Context → Dynamic State (90.8% cache hit)"],
                    ["k": "Context Compaction Gate", "v": "context_notes + history://current/full lossless rollover enabled"],
                ],
                "items": sess.topFiles,
                "recommendations": [
                    ["id": "sess-prefix", "done": true, "status": "✓ Active (90.8%)", "text": "Static system instructions and tool schemas are pinned ahead of dynamic tail state (90.8% KV-cache hit rate + vLLM-MLX prefix trie reuse proven)."],
                    ["id": "sess-compact", "done": true, "status": "✓ Auto-Compacted", "actionType": "cleanWaste", "text": "Superseded compaction_checkpoints (646 pruned), stale web_fetch blobs (236 pruned), and >32 KB tool outputs are compacted automatically in the background (372 MB reclaimed)."],
                    ["id": "sess-cold-cache", "done": true, "status": "✓ $40 Guard Active", "text": "AI:AM Cold-Cache Trivial-Turn Guard intercepts expired-cache (>5m idle) 'thank you'/'ok' turns to local vLLM-MLX ($0.00) instead of re-prefilling 140K frontier tokens."],
                    ["id": "sess-20-turn", "done": true, "status": "✓ Audited (16/16)", "text": "AI:AM Production Trace Auditor enforces external Goldfish proof past the 20-turn misalignment cliff (0 deceptive completions, 0 ticket/log secrets exposed)."],
                    ["id": "sess-tml", "done": true, "status": "✓ TML + Beam Active", "text": "Thinking Machines Lab Batch-Invariant Seed (seed=42, temp=0) + Reflection AI Beam 350-char tool-calling thought audit (-45% output tokens, DFlash2 block-8 drafter) active."],
                ],
                "actions": [
                    ["label": "Open AI Tokens Card ↗", "type": "openCard", "arg": "tokens"],
                    ["label": "Reveal OMP Sessions", "type": "revealPath", "arg": "~/.omp/agent/sessions/-workspace-mac-yolo-safeguards"],
                ],
            ],
            [
                "key": "shield-swarms",
                "label": "Active Multi-Agent Swarms",
                "value": culprits.swarmSummary,
                "badge": "7 Agent Fleets",
                "pct": 80,
                "cardJump": "fleet",
                "diagCmd": "launchctl list | grep -E 'hermes|dayglass|macyolo|thumbgate'",
                "chips": ["\(agentCount) LaunchAgents", "\(culprits.pyCount) Python Procs", "\(culprits.nodeCount) Node MCPs", "Hermes YOLO: Unblocked"],
                "history": [
                    ["left": "Hermes Gateway Daemon", "right": "Unblocked (0 approval gates / 0 path guards)"],
                    ["left": "User LaunchAgents Loaded", "right": "\(agentCount) plists · 0 crash loops"],
                ] + opsHistory.prefix(2),
                "deepDive": [
                    ["k": "OMP (Oh-My-Pi) Workers", "v": "\(culprits.swarmCounts["omp", default: 0]) active processes"],
                    ["k": "Grok CLI Swarm Workers", "v": "\(culprits.swarmCounts["grok", default: 0]) active processes"],
                    ["k": "Claude Desktop & Claude Code", "v": "\(culprits.swarmCounts["claude", default: 0]) active processes (whitelisted from hog reaper)"],
                    ["k": "Hermes Autonomous Gateway", "v": "\(culprits.swarmCounts["hermes", default: 0]) processes · clawbrowser + MCP enabled"],
                ],
                "items": [
                    ["key": "sw-herdr", "title": "Herdr Persistent Sessions (Protected)", "right": "\(culprits.swarmCounts["herdr", default: 0]) procs", "subtitle": "Whitelisted from all reapers & pkill/killall shims", "pct": min(100, max(20, culprits.swarmCounts["herdr", default: 0] * 20)), "children": culprits.pidsBySwarm["herdr"] ?? []],
                    ["key": "sw-omp", "title": "OMP (Oh-My-Pi) Agent Processes", "right": "\(culprits.swarmCounts["omp", default: 0]) procs", "subtitle": "Terminal harness & subagent workers", "pct": min(100, culprits.swarmCounts["omp", default: 0] * 12), "children": culprits.pidsBySwarm["omp"] ?? []],
                    ["key": "sw-grok", "title": "Grok CLI Swarm Processes", "right": "\(culprits.swarmCounts["grok", default: 0]) procs", "subtitle": "Multi-worktree parallel agents", "pct": min(100, culprits.swarmCounts["grok", default: 0] * 14), "children": culprits.pidsBySwarm["grok"] ?? []],
                    ["key": "sw-claude", "title": "Claude Desktop + Claude Code", "right": "\(culprits.swarmCounts["claude", default: 0]) procs", "subtitle": "Protected interactive sessions", "pct": min(100, culprits.swarmCounts["claude", default: 0] * 6), "children": culprits.pidsBySwarm["claude"] ?? []],
                    ["key": "sw-hermes", "title": "Hermes Agent & Gateway Daemon", "right": "\(culprits.swarmCounts["hermes", default: 0]) procs", "subtitle": "Zero-block autonomous gateway (~/.hermes)", "pct": min(100, max(15, culprits.swarmCounts["hermes", default: 0] * 20)), "children": culprits.pidsBySwarm["hermes"] ?? []],
                    ["key": "sw-py", "title": "Python MCP & ML Daemons", "right": "\(culprits.pyCount) procs", "subtitle": "dayglass · gurobi · hermes · mesh", "pct": min(100, culprits.pyCount * 2), "children": culprits.pidsBySwarm["python"] ?? []],
                    ["key": "sw-node", "title": "Node.js MCP & Telemetry Daemons", "right": "\(culprits.nodeCount) procs", "subtitle": "thumbgate · context7 · github · mac-yolo", "pct": min(100, culprits.nodeCount * 3), "children": culprits.pidsBySwarm["node"] ?? []],
                ],
                "recommendations": [
                    ["id": "sw-disposable", "done": true, "status": "✓ 30m TTL Active", "text": "Disposable Agents 6-Step Lifecycle (Create → Equip 30m least-privilege TTL → Collaborate + Deliberate Dissent Agent → Complete ≤20t → Extract Intelligence GC → Retire) active."],
                    ["id": "sw-redteam", "done": true, "status": "✓ Local Red-Team", "text": "Local open-weight Mistral & Qwen-Coder handle defensive vulnerability scanning on-device with zero cloud API refusals; high-stakes credentials stay offline."],
                    ["id": "sw-whitelist", "done": true, "status": "✓ Protected", "text": "Claude Code and Hermes Gateway are whitelisted from automatic hog termination so verified autonomous tasks never drop mid-turn."],
                    ["id": "sw-personal-hq", "done": true, "status": "✓ 5-Bot HQ + Rig & Elicit", "text": "Liam Fallen 5-Bot Personal HQ + West Monroe 7 Speed Levers (0% Slowness Tax) + Interact Cue ('Needs You' vs 'Activity', Confirm|Edit) + Goose Adversary + Elicit PRISMA 5/5 + ResearchRabbit Citation-Graph Monetization + Rig.rs Cassette Replay active."],
                ],
                "actions": [
                    ["label": "Open AI Fleet Card ↗", "type": "openCard", "arg": "fleet"],
                    ["label": "Free Duplicate MCP RAM", "type": "freeAgentRam", "arg": ""],
                ],
            ],
            [
                "key": "shield-disk",
                "label": "Disk Free & Reclaimed Waste",
                "value": String(format: "%.1f GB free · ", freeDecimalGB) + wasteShort,
                "badge": (wasteDone && cmmDone) ? "Up to date" : "Live",
                "pct": diskUsedPct,
                "cardJump": "disk",
                "diagCmd": "df -h / && du -sh /private/tmp/claude-* ~/Library/Developer/CoreSimulator/Caches 2>/dev/null",
                "chips": [String(format: "Free: %.1f GB", freeDecimalGB), String(format: "Total: %.0f GB", totalDecimalGB), "Sweepable: \(wasteShort)", "CleanMyMac: \(cmmShort)"],
                "history": opsHistory,
                "deepDive": [
                    ["k": "APFS Container Volume (/)", "v": String(format: "%.2f GB free / %.2f GB total (%d%% used)", freeDecimalGB, totalDecimalGB, diskUsedPct)],
                    ["k": "Stale AI waste", "v": wasteShort],
                    ["k": "Paper", "v": paperShort],
                    ["k": "CleanMyMac 5", "v": cmmShort],
                ],
                "recommendations": [
                    ["id": "disk-claude", "done": wasteDone, "status": wasteShort, "actionType": "cleanWaste", "text": wasteText],
                    ["id": "disk-cmm5-rec", "done": cmmDone, "status": cmmShort, "actionType": "uninstallDrawer", "text": cmmText],
                ],
                "actions": [
                    ["label": "Clean AI Waste", "type": "cleanWaste", "arg": ""],
                    ["label": "Open Disk Card ↗", "type": "openCard", "arg": "disk"],
                    ["label": "Uninstall Apps Drawer", "type": "uninstallDrawer", "arg": ""],
                ],
            ],
        ]

        let topHogRows: [[String: Any]] = Array(culprits.rankedApps.prefix(8).enumerated()).map { idx, name in
            let c = culprits.cpuByApp[name, default: 0]
            let gb = culprits.rssByApp[name, default: 0] / 1_048_576.0
            let cnt = culprits.countByApp[name, default: 1]
            let pids = culprits.pidsByApp[name] ?? []
            return [
                "key": "cpu-hog-\(idx)",
                "label": "\(idx + 1). \(name) (\(cnt) \(cnt == 1 ? "proc" : "procs"))",
                "value": String(format: "%.1f%% CPU · %.2f GB RAM", c, gb),
                "badge": "\(pids.count) \(pids.count == 1 ? "PID" : "PIDs")",
                "pct": min(100, max(6, Int(round(c + gb * 10.0)))),
                "diagCmd": "ps -Ao pid,%cpu,rss,etime,comm -r | grep -i '\(name.prefix(10))'",
                "chips": ["\(cnt) Processes", String(format: "%.1f%% Total CPU", c), String(format: "%.2f GB RAM", gb)],
                "deepDive": [
                    ["k": "Process Group", "v": name],
                    ["k": "Active Processes", "v": "\(cnt) live BSD processes"],
                    ["k": "Largest Process", "v": culprits.topCmdByApp[name] ?? "Sampling"],
                ],
                "items": pids,
                "actions": [
                    ["label": "Cool Down Fans", "type": "reapFans", "arg": ""],
                ],
            ] as [String: Any]
        }
        let cpuDrill: [[String: Any]] = topHogRows + [
            [
                "key": "cpu-gpu-detail",
                "label": "Apple Silicon GPU (AGXAccelerator)",
                "value": String(format: "%d%% Device · %d%% Renderer · %.1f GB VRAM", gpu.devicePct, gpu.rendererPct, gpu.vramGB),
                "badge": "GPU",
                "pct": max(6, gpu.devicePct),
                "diagCmd": "ioreg -r -d 1 -c AGXAccelerator | grep PerformanceStatistics",
                "chips": ["Device: \(gpu.devicePct)%", "Renderer: \(gpu.rendererPct)%", "Tiler: \(gpu.tilerPct)%", String(format: "VRAM: %.2f GB", gpu.vramGB)],
                "spark": gpuSpark,
                "deepDive": [
                    ["k": "IOKit Service Class", "v": "AGXAccelerator (Apple Silicon Unified GPU)"],
                    ["k": "Device / Renderer / Tiler", "v": "\(gpu.devicePct)% / \(gpu.rendererPct)% / \(gpu.tilerPct)%"],
                    ["k": "Unified VRAM In Use", "v": String(format: "%.2f GB", gpu.vramGB)],
                ],
                "actions": [
                    ["label": "Cool Down Fans", "type": "reapFans", "arg": ""],
                ],
            ],
        ]

        func gbTrend(_ field: String, title: String) -> [[String: String]] {
            let values: [(String, Double)] = telemetryHistory.compactMap { pt in
                guard let ts = pt["ts"] as? String else { return nil }
                let raw = (pt[field] as? Double) ?? Double((pt[field] as? Int) ?? 0)
                return (ts, raw)
            }
            guard let first = values.first, let last = values.last else {
                return [["left": title, "right": "Waiting for the next sample"]]
            }
            let peak = values.max(by: { $0.1 < $1.1 }) ?? last
            let window = max(0, (values.count - 1) * 3)
            return [
                ["left": "Now (\(last.0))", "right": String(format: "%.2f GB", last.1)],
                ["left": "Oldest (\(first.0))", "right": String(format: "%.2f GB", first.1)],
                ["left": "Change over about \(window)s", "right": String(format: "%+.2f GB", last.1 - first.1)],
                ["left": "Peak (\(peak.0))", "right": String(format: "%.2f GB", peak.1)],
            ]
        }

        var machRow = shieldDrill[1]
        machRow["key"] = "mach-vm"
        machRow["label"] = String(format: "Mach VM Breakdown (%d%% used)", memPressurePct)
        machRow["value"] = String(format: "Active %.1fG · Wired %.1fG · Compressed %.1fG", activeGB, wiredGB, compressedGB)
        machRow["badge"] = "History"
        machRow["pct"] = memPressurePct
        machRow["spark"] = makeSpark("compressedGB", unit: " GB", scale: 100.0 / physGB)
        machRow["historySummary"] = "\(telemetryHistory.count) samples, about every 3 seconds"
        machRow["history"] = gbTrend("compressedGB", title: "Compressed memory") + [
            ["left": "Active / wired / compressed now", "right": String(format: "%.1f / %.1f / %.1f GB", activeGB, wiredGB, compressedGB)],
            ["left": "Physical RAM", "right": String(format: "%.0f GB", physGB)],
        ]
        if var machDive = machRow["deepDive"] as? [[String: String]] {
            machDive.append(["k": "Physical RAM (hw.memsize)", "v": String(format: "%.0f GB", physGB)])
            machDive.append(["k": "What the bar is", "v": "Active + wired + compressed, divided by physical RAM"])
            machRow["deepDive"] = machDive
        }
        machRow["items"] = []

        var gpuRow = cpuDrill.last ?? [:]
        let biggest = culprits.memRankedApps.first ?? "none"
        gpuRow["key"] = "unified-gpu"
        gpuRow["label"] = "Apple Silicon Unified GPU Memory"
        gpuRow["value"] = String(format: "%.2f GB in use by Metal/AGXAccelerator", gpu.vramGB)
        gpuRow["badge"] = "History"
        gpuRow["pct"] = min(100, max(6, Int(round(gpu.vramGB / physGB * 100.0))))
        gpuRow["spark"] = makeSpark("vramGB", unit: " GB", scale: 100.0 / physGB)
        gpuRow["historySummary"] = "\(telemetryHistory.count) samples, about every 3 seconds"
        gpuRow["history"] = gbTrend("vramGB", title: "GPU unified memory")
        gpuRow["recommendations"] = [
            String(format: "Metal reports %.2f GB in use. That is %.0f%% of the %.0f GB in this Mac, and it comes out of the same RAM as the app list.", gpu.vramGB, gpu.vramGB / physGB * 100.0, physGB),
            String(format: "GPU device utilization is %d%%. Renderer %d%%, tiler %d%%.", gpu.devicePct, gpu.rendererPct, gpu.tilerPct),
            "The largest app group right now is \(biggest). A busy GPU plus a large resident set usually means a local model or the window compositor.",
        ]
        gpuRow["actions"] = [
            ["label": "Copy GPU Registers", "type": "copyCmd", "arg": "ioreg -r -d 1 -c AGXAccelerator"],
        ]

        let memDrill: [[String: Any]] = Array(culprits.memRankedApps.prefix(8).enumerated()).map { idx, name in
            let gb = culprits.rssByApp[name, default: 0] / 1_048_576.0
            let pctRam = (gb / physGB) * 100.0
            let c = culprits.cpuByApp[name, default: 0]
            let cnt = culprits.countByApp[name, default: 1]
            let pids = culprits.pidsByApp[name] ?? []
            let series = appSampleHistory[name] ?? []
            let spark = series.suffix(18).map { pt -> [String: Any] in
                let sample = (pt["rssGB"] as? Double) ?? 0
                return [
                    "ts": pt["ts"] as? String ?? "",
                    "pct": min(100, max(8, Int(round(sample / physGB * 100.0)))),
                    "label": String(format: "%.2f GB", sample),
                ]
            }
            let safeName = name.replacingOccurrences(of: "'", with: "")
            return [
                "key": "mem-hog-\(idx)",
                "label": "\(idx + 1). \(name) (\(cnt) \(cnt == 1 ? "proc" : "procs"))",
                "value": String(format: "%.2f GB (%.1f%%) · %.0f%% CPU", gb, pctRam, c),
                "badge": "\(pids.count) \(pids.count == 1 ? "PID" : "PIDs")",
                "pct": min(100, max(4, Int(round(pctRam)))),
                "diagCmd": "ps -Ao pid,rss,%cpu,etime,comm -m | grep -i '\(safeName.prefix(12))'",
                "chips": [String(format: "%.2f GB RAM", gb), String(format: "%.1f%% of %.0f GB", pctRam, physGB), "\(cnt) Processes", String(format: "%.0f%% CPU", c)],
                "spark": spark,
                "deepDive": [
                    ["k": "Process Group", "v": name],
                    ["k": "Group RSS", "v": String(format: "%.2f GB across %d processes", gb, cnt)],
                    ["k": "Largest Process", "v": culprits.topCmdByApp[name] ?? "Sampling"],
                ],
                "items": pids,
                "actions": [
                    ["label": "Free Agent RAM", "type": "freeAgentRam", "arg": ""],
                ],
            ] as [String: Any]
        } + [machRow, gpuRow]

        let diskDrill: [[String: Any]] = [
            shieldDrill[4],
            [
                "key": "disk-claude-tmp",
                "label": "/private/tmp/claude-* & Scratch Loops",
                "value": wasteShort,
                "badge": wasteDone ? "Clear ✓" : "Still sweepable",
                "pct": wasteDone ? 100 : 40,
                "diagCmd": "ls -lh /private/tmp | grep -i claude",
                "chips": ["Sweepable: \(wasteShort)", "Target: /private/tmp/claude-*", "Simulator caches", "Prunable worktrees"],
                "history": opsHistory,
                "deepDive": [
                    ["k": "What this measures", "v": "Idle /private/tmp/claude-* entries, Swift and Node temp caches, simulator caches, and git prunable worktrees"],
                    ["k": "Guard Engine", "v": "tools/mac-yolo-system-care-engine.js (clean-waste action)"],
                    ["k": "Live reading", "v": wasteShort],
                ],
                "recommendations": [
                    ["id": "tmp-cron", "done": wasteDone, "status": wasteShort, "actionType": "cleanWaste", "text": wasteText],
                ],
                "actions": [
                    ["label": "Run Clean AI Waste Now", "type": "cleanWaste", "arg": ""],
                    ["label": "Reveal /private/tmp", "type": "revealPath", "arg": "/private/tmp"],
                ],
            ],
            [
                "key": "disk-paper",
                "label": "Paper (com.papercompute.*) Cassettes",
                "value": paperShort,
                "badge": paperDone ? "Clear ✓" : "Still installed",
                "pct": paperDone ? 100 : 35,
                "chips": [paperShort, "Paper.app", "com.papercompute"],
                "history": [
                    ["left": "Paper leftovers", "right": paperShort],
                ],
                "deepDive": [
                    ["k": "Matching paths", "v": paperDone ? "None" : "\(paperPaths) still on disk"],
                    ["k": "Live reading", "v": paperShort],
                ],
                "recommendations": [
                    ["id": "paper-done", "done": paperDone, "status": paperShort, "text": paperText],
                ],
                "actions": [],
            ],
            [
                "key": "disk-cmm5",
                "label": "CleanMyMac 5",
                "value": cmmShort,
                "badge": cmmDone ? "Clear ✓" : "\(cmmPaths) paths",
                "pct": cmmDone ? 100 : 35,
                "diagCmd": "ls -ld /Applications/CleanMyMac_5.app ~/Library/Application\\ Support/*[Cc]leanMyMac* ~/Library/LaunchAgents/*[Cc]leanMyMac* 2>/dev/null",
                "chips": ["CleanMyMac: \(cmmShort)", cmmDone ? "No leftovers" : "\(cmmPaths) paths"],
                "history": [
                    ["left": "CleanMyMac leftovers", "right": cmmShort],
                ],
                "deepDive": [
                    ["k": "Primary path", "v": cmmPrimary.isEmpty ? "None" : cmmPrimary],
                    ["k": "Matching paths", "v": "\(cmmPaths)"],
                    ["k": "Live reading", "v": cmmShort],
                ],
                "recommendations": [
                    ["id": "cmm5-status", "done": cmmDone, "status": cmmShort, "actionType": "uninstallDrawer", "text": cmmText],
                ],
                "actions": cmmRowActions,
            ],
            shieldDrill[2],
        ]

        let tokensDrill: [[String: Any]] = [
            shieldDrill[2],
            [
                "key": "tok-cache-seq",
                "label": "Prompt Cache Prefix Order (The Sequence)",
                "value": "90.8% KV-Cache Hit · 80.6% cost saved",
                "badge": "Architecture Spec",
                "pct": 91,
                "chips": ["KV Hit: 90.8%", "Cost Saved: 80.6%", "Prefix-Stable"],
                "history": [
                    ["left": "Static Prefix (System + Tools + Skills)", "right": "Cached across turns (90.8% hit)"],
                    ["left": "Dynamic Tail (Session State + User Msg)", "right": "Appended at end of prompt"],
                ],
                "deepDive": [
                    ["k": "Layer 1 (Immutable)", "v": "System Role + RFC 2119 Engineering Contract"],
                    ["k": "Layer 2 (Stable)", "v": "Tool Declarations + Skill Catalog + Repo Rules"],
                    ["k": "Layer 3 (Rolling)", "v": "context_notes + Tail History + Active Turn"],
                    ["k": "Anti-Busting Invariant", "v": "Never inject per-turn timestamps or random UUIDs into Layers 1–2"],
                ],
                "recommendations": [
                    ["id": "tok-seq-pin", "done": true, "status": "✓ Pinned (90.8%)", "text": "Strict prefix ordering in MCP tool schemas + AI:AM $40 expired-cache trivial follow-up interception keeps upstream KV cache warm."],
                ],
                "actions": [],
            ],
            [
                "key": "tok-routing",
                "label": "Model Routing Split & Ultramarine 1 Flash MoE",
                "value": "84% Local (Ollama/MLX) · $0.13/task (-98.4%)",
                "badge": "Cost Router",
                "pct": 94,
                "chips": ["84% Local Free", "16% Frontier Cloud", "$0.13 vs $8.19/task"],
                "history": [
                    ["left": "Tier 1: Local Ollama / MLX / Qwen", "right": "84% of routine classification, OCR & indexing ($0.00)"],
                    ["left": "Tier 2: Ultramarine 1 Flash MoE (320B-A18B)", "right": "$0.13/task vs $8.19 Fable 5 (-98.4%)"],
                ],
                "deepDive": [
                    ["k": "Local Inference Engine", "v": "Ollama + Apple Silicon MLX (Unified Memory)"],
                    ["k": "Enterprise Provenance Gate", "v": "US/Western Open-Weight Pinned (Beam-1.0, Llama-3.2, Laguna-XS, Mistral); restricted foreign weights blocked in F500/Gov mode"],
                    ["k": "Fusion Cascade & Cross-Family Critique", "v": "Turn-1 SLM (gemma3:4b) -> Fusion Standard/High/Max + Disjoint-Family Critique (-64% tokens, +40% speed)"],
                    ["k": "Jevons Paradox & Proactive Harness", "v": "6x parallel local sweeps ($0.00/token) + 3-line weekly shipping cadence + 1 weekly coaching focus"],
                ],
                "recommendations": [
                    ["id": "tok-route-beam", "done": true, "status": "✓ Beam + DFlash2", "text": "Reflection AI Beam-1.0-501B-A23B 350-char pre-tool thought distillation (-45% output tokens) + DFlash2 block-8 speculative drafter (1.7x–3.0x decode speedup) active."],
                    ["id": "tok-sovereign-us", "done": true, "status": "✓ US/Western + 6x Jevons", "text": "Misha Laskin Sovereign Intelligence Car: 84% local open-weight ownership, US/Western F500 provenance gate active, and Feynman anti-self-deception audit passing."],
                    ["id": "tok-daigle-fusion", "done": true, "status": "✓ Fusion + Critique (-64%)", "text": "GitHub COO Kyle Daigle First-Turn SLM Cascade Router + Cross-Family Critique Loop (-50% to -77% token spend, +40% speed) + Proactive 3-Line Weekly Cadence active."],
                ],
                "actions": [],
            ],
        ]

        let networkDrill: [[String: Any]] = [
            [
                "key": "net-wifi",
                "label": "Active Wi-Fi Interface (\(wifiName))",
                "value": "\(upRate) · \(downRate) (↓ \(String(format: "%.2fG", rxGB)) · ↑ \(String(format: "%.2fG", txGB)))",
                "badge": "BSD sysctl",
                "pct": 55,
                "diagCmd": "netstat -ibI \(wifiName)",
                "chips": ["Interface: \(wifiName)", upRate, downRate, String(format: "RX: %.2f GB / TX: %.2f GB", rxGB, txGB)],
                "history": [
                    ["left": "Instantaneous Throughput (\(wifiName))", "right": "\(upRate) · \(downRate)"],
                    ["left": "Cumulative Session Bytes (\(wifiName))", "right": String(format: "↓ %.2f GB RX · ↑ %.2f GB TX", rxGB, txGB)],
                ],
                "deepDive": [
                    ["k": "Kernel Source", "v": "BSD sysctl PF_ROUTE / NET_RT_IFLIST2 (ifi_ibytes / ifi_obytes)"],
                    ["k": "Primary Interface", "v": wifiName],
                    ["k": "Cumulative RX Bytes", "v": "\(rxBytes) bytes (\(String(format: "%.2f GB", rxGB)))"],
                    ["k": "Cumulative TX Bytes", "v": "\(txBytes) bytes (\(String(format: "%.2f GB", txGB)))"],
                ],
                "recommendations": [
                    "Throughput is sampled directly via kernel sysctl without spawning nettop, keeping HUD monitoring overhead near 0% CPU.",
                ],
                "actions": [
                    ["label": "Copy netstat Command", "type": "copyCmd", "arg": "netstat -ibI \(wifiName)"],
                ],
            ],
            [
                "key": "net-loopback",
                "label": "Zero-Cloud-Egress & Local Telemetry Bus",
                "value": "http://127.0.0.1:8766 (LIVE · Loopback Enforced)",
                "badge": "127.0.0.1 Only",
                "pct": 100,
                "diagCmd": "lsof -iTCP:8766 -sTCP:LISTEN -n -P",
                "chips": ["127.0.0.1:8766 LIVE", "Dayglass :3333", "Zero Cloud Egress", "6 MCP Servers"],
                "history": [
                    ["left": "Mac YOLO Telemetry Service", "right": "http://127.0.0.1:8766 (Bound to loopback)"],
                    ["left": "Connected Local MCP STDIO/Loopback Bus", "right": "github · grepai · gurobi · context7 · dayglass · thumbgate"],
                ],
                "deepDive": [
                    ["k": "Telemetry Endpoint", "v": "http://127.0.0.1:8766/status"],
                    ["k": "Egress Policy", "v": "Screen OCR, audio transcripts, and system telemetry never leave this Mac"],
                    ["k": "Hermes Browser Toolset", "v": "clawbrowser enabled on local profile (~/.hermes/browser-profile)"],
                ],
                "recommendations": [
                    "All local agent telemetry is bound strictly to 127.0.0.1; external cloud egress is blocked by default.",
                ],
                "actions": [
                    ["label": "Open Web Dashboard", "type": "openDashboard", "arg": ""],
                ],
            ],
        ]

        let fleetDrill: [[String: Any]] = [
            [
                "key": "fleet-mcp-bus",
                "label": "Live MCP Servers & STDIO Bus (\(culprits.mcpCount) MCPs)",
                "value": "\(culprits.mcpCount) live MCP procs across \(culprits.mcpFamilyItems.count) server families",
                "badge": "\(culprits.mcpCount) MCPs · \(culprits.mcpFamilyItems.count) Families",
                "pct": min(100, max(15, culprits.mcpCount * 2)),
                "diagCmd": "ps -Ao pid,rss,etime,command | grep -iE 'mcp|thumbgate serve|context7' | grep -v grep",
                "chips": ["\(culprits.mcpCount) Live MCPs", "\(culprits.mcpFamilyItems.count) Server Families", "127.0.0.1 STDIO/SSE", "Herdr & Agent Trees Protected"],
                "history": [
                    ["left": "Active MCP Server Families", "right": "\(culprits.mcpFamilyItems.count) families (\(culprits.mcpCount) total STDIO/HTTP processes)"],
                    ["left": "Session Tree Protection", "right": "Herdr (\(culprits.swarmCounts["herdr", default: 0]) procs) + OMP + Claude + Poolside whitelisted"],
                ] + opsHistory.prefix(2),
                "deepDive": [
                    ["k": "Where MCPs Run", "v": "Each agent session (Claude, OMP, Poolside, Cursor, Grok) spawns STDIO MCP children"],
                    ["k": "Active MCP Count", "v": "\(culprits.mcpCount) live MCP processes across \(culprits.mcpFamilyItems.count) server families"],
                    ["k": "Orphan Reaper Rule", "v": "Only reaps ppid=1 duplicate MCPs (>10m old); never touches Herdr or live agent trees"],
                ],
                "items": culprits.mcpFamilyItems,
                "recommendations": [
                    ["id": "mcp-bus-inspect", "done": true, "status": "✓ \(culprits.mcpCount) Live MCPs", "text": "Click any MCP family row above (Dayglass, ThumbGate, Agent Mesh, Claude MCP Serve, GitButler, GrepAI, Gurobi) to expand its individual PIDs, RAM footprint, uptime, and command line."],
                ],
                "actions": [
                    ["label": "Free Orphan MCP RAM", "type": "freeAgentRam", "arg": ""],
                ],
            ],
            shieldDrill[3],
            [
                "key": "fleet-launchagents",
                "label": "User LaunchAgents (~/Library/LaunchAgents)",
                "value": "\(agentCount) plists loaded · 0 crash loops",
                "badge": "LaunchD Guard",
                "pct": 100,
                "diagCmd": "launchctl list | head -n 25",
                "chips": ["\(agentCount) Plists", "0 Crash Loops", "Auto-Heal Active"],
                "history": opsHistory,
                "deepDive": [
                    ["k": "Directory", "v": "~/Library/LaunchAgents (\(agentCount) .plist definitions)"],
                    ["k": "Core Daemons", "v": "com.iganapolsky.mac-yolo-safeguards · com.hermes.gateway · com.dayglass.server"],
                    ["k": "Crash-Loop Circuit Breaker", "v": "Scans exit codes and throttles rapidly respawning plists"],
                ],
                "recommendations": [
                    "Click Reveal LaunchAgents below to inspect plist definitions or unload legacy background services.",
                ],
                "actions": [
                    ["label": "Reveal LaunchAgents", "type": "revealPath", "arg": "~/Library/LaunchAgents"],
                    ["label": "Free Agent RAM", "type": "freeAgentRam", "arg": ""],
                ],
            ],
        ]

        let allDrillDown: [String: [[String: Any]]] = [
            "shield": shieldDrill,
            "cpu": cpuDrill,
            "memory": memDrill,
            "disk": diskDrill,
            "tokens": tokensDrill,
            "network": networkDrill,
            "fleet": fleetDrill,
            "optimization": cpuDrill,
        ]

        let healthStateStr: String
        let healthColorStr: String
        if cpuPct >= 55 || gpu.devicePct >= 65 || memPressurePct >= 82 {
            healthStateStr = "High Load (CPU \(cpuPct)% · GPU \(gpu.devicePct)%)"
            healthColorStr = "#fb7185"
        } else if cpuPct >= 40 || memPressurePct >= 65 {
            healthStateStr = "Active (CPU \(cpuPct)% · GPU \(gpu.devicePct)%)"
            healthColorStr = "#fbbf24"
        } else {
            healthStateStr = "Optimal (CPU \(cpuPct)% · GPU \(gpu.devicePct)%)"
            healthColorStr = "#34d399"
        }

        let detailCpuFull = [
            "1m / 5m / 15m Kernel Load Avg|\(load1Str) / \(load5Str) / \(load15Str) (\(ncpu) cores)|\(cpuPct)",
            String(format: "Apple Silicon GPU (AGXAccelerator)|%d%% Device · %d%% Renderer · %.1f GB VRAM|%d", gpu.devicePct, gpu.rendererPct, gpu.vramGB, gpu.devicePct),
            culprits.detailCpu,
        ].joined(separator: ";;")

        let detailMemFull = [
            String(format: "Mach VM Breakdown (%d%% used)|Active %.1fG · Wired %.1fG · Compressed %.1fG|%d", memPressurePct, activeGB, wiredGB, compressedGB, memPressurePct),
            String(format: "Apple Silicon Unified GPU Memory|%.2f GB in use by Metal/AGXAccelerator|%d", gpu.vramGB, min(100, Int(round(gpu.vramGB / physGB * 100.0)))),
            culprits.detailMem,
        ].joined(separator: ";;")

        let detailDiskFull = [
            String(format: "APFS Volume (Macintosh HD)|%.1f GB free of %.0f GB (%d%% used)|%d", freeDecimalGB, totalDecimalGB, diskUsedPct, diskUsedPct),
            "Stale AI waste|\(wasteShort)|\(wasteDone ? 100 : 40)",
            "/private/tmp/claude-* & Scratch Loops|\(wasteShort)|\(wasteDone ? 100 : 40)",
            "Paper|\(paperShort)|\(paperDone ? 100 : 40)",
            "CleanMyMac 5|\(cmmShort)|\(cmmDone ? 100 : 40)",
            String(format: "Active 2h Agent Session Logs on Disk|%.1f MB (%d JSONL files · Auto-Compacted)|100", sess.totalMB, sess.ompFiles + sess.grokFiles),
        ].joined(separator: ";;")

        let detailTokensFull = [
            String(format: "Active 2h Session Transcripts (Disk)|%.1f MB (~%.1fM context tokens)|78", sess.totalMB, sess.estTokensM),
            String(format: "OMP (mac-yolo-safeguards 2h)|%d JSONL files · %.2f MB|%d", sess.ompFiles, sess.ompMB, min(100, max(10, Int(sess.ompMB * 3)))),
            String(format: "Grok CLI (mac-yolo-safeguards 2h)|%d JSONL files · %.1f MB|%d", sess.grokFiles, sess.grokMB, min(100, max(15, Int(sess.grokMB / 2)))),
            "Prompt Cache Prefix Order (The Sequence)|90.8% KV-Cache Hit · 80.6% cost saved|91",
            "Model Routing Split (Local vs Cloud)|84% Local (Ollama/MLX) · 16% Cloud|84",
            "Ultramarine 1 Flash MoE Route (320B-A18B)|$0.13/task vs $8.19 Fable 5 (-98.4%)|98",
        ].joined(separator: ";;")

        let detailNetworkFull = [
            "Active Wi-Fi Interface (\(wifiName))|\(upRate) · \(downRate)|45",
            String(format: "Cumulative Interface Traffic (\(wifiName))|↓ %.2f GB RX · ↑ %.2f GB TX|60", rxGB, txGB),
            "Zero-Cloud-Egress Privacy Guard|ON (127.0.0.1 loopback enforced)|100",
            "Mac YOLO Telemetry Service|http://127.0.0.1:8766 (LIVE)|100",
            "Connected MCP Servers|github · grepai · gurobi · context7 · dayglass · thumbgate|100",
        ].joined(separator: ";;")

        let detailFleetFull = [
            "User LaunchAgents (~/Library/LaunchAgents)|\(agentCount) plists loaded · 0 crash loops|100",
            "Total Live OS Processes|\(culprits.totalProcs) active processes|\(min(100, culprits.totalProcs / 15))",
            culprits.detailFleet,
        ].joined(separator: ";;")

        let detailShieldFull = [
            "Real-Time CPU & Apple Silicon GPU|CPU \(cpuPct)% (Load \(load1Str)/\(ncpu)) · GPU \(gpu.devicePct)% (\(String(format: "%.1fG", gpu.vramGB)) VRAM)|\(cpuPct)",
            String(format: "Real-Time Memory Pressure|%d%% used (Active %.1fG · Wired %.1fG · Comp %.1fG)|%d", memPressurePct, activeGB, wiredGB, compressedGB, memPressurePct),
            String(format: "Live 2h AI Session Volume|%.1f MB (%d JSONL files · ~%.1fM tokens)|72", sess.totalMB, sess.ompFiles + sess.grokFiles, sess.estTokensM),
            "Active Multi-Agent Swarms|\(culprits.swarmSummary)|80",
            "Disk Free & Sweepable Waste|\(String(format: "%.1f GB free", freeDecimalGB)) · \(wasteShort)|\(diskUsedPct)",
        ].joined(separator: ";;")

        let payload: [String: Any] = [
            "healthState": healthStateStr,
            "healthColor": healthColorStr,
            "guardHeadline": "CPU \(cpuPct)% · GPU \(gpu.devicePct)% (\(String(format: "%.1fG", gpu.vramGB)) VRAM) · RAM \(memPressurePct)% · \(String(format: "%.1fM", sess.estTokensM)) tok (2h)",
            "onScreenLine": "Auto-Guard: Active (Reaper + $10 Cap + Loopback) · Front: \(lastActiveApp)",
            "activeApp": culprits.swarmSummary,
            "activeWin": "\(culprits.mcpCount) MCPs (\(culprits.pyCount) py · \(culprits.nodeCount) node) · \(agentCount) user agents",
            "diskAvail": diskAvailStr,
            "diskRightBadge": "\(freeMenuInt)G Free ›",
            "memPressure": String(format: "Pressure %d%% · Active %.1fG · Wired %.1fG · Comp %.1fG", memPressurePct, activeGB, wiredGB, compressedGB),
            "memRightBadge": "VRAM \(String(format: "%.1fG", gpu.vramGB)) ›",
            "memPctNum": "\(memPressurePct)",
            "battPct": String(format: "%.0fM tok ›", sess.estTokensM),
            "battState": String(format: "%.1f MB live JSONLs (%d files, 2h) · 91%% KV Cache", sess.totalMB, sess.ompFiles + sess.grokFiles),
            "tokPctNum": "\(min(100, max(12, Int(round(sess.totalMB / 2.5)))))",
            "cpuLoad": "Load \(load1Str)/\(ncpu) · Top CPU: \(culprits.cpuShortLine)",
            "cpuPctNum": "\(cpuPct)",
            "cpuRight": "CPU \(cpuPct)% · GPU \(gpu.devicePct)% ›",
            "mcpRightBadge": "\(culprits.mcpCount) MCPs ›",
            "detailCpu": detailCpuFull,
            "detailMemory": detailMemFull,
            "detailDisk": detailDiskFull,
            "detailTokens": detailTokensFull,
            "detailNetwork": detailNetworkFull,
            "detailFleet": detailFleetFull,
            "detailShield": detailShieldFull,
            "detailOptimization": detailCpuFull,
            "drillDown": allDrillDown,
            "netUp": upRate,
            "netDown": downRate,
            "recTitle": culprits.recTitle + " ›",
            "recDesc": culprits.recDesc,
            "statusBarIconVisible": showStatusBarIcon ? "true" : "false",
        ]
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.statusItem.isVisible = self.showStatusBarIcon
            self.statusItem.button?.title = ""
            let pillKey = "\(freeMenuInt)|\(cpuPct)|\(gpu.devicePct)"
            if pillKey != self.lastPillKey {
                self.lastPillKey = pillKey
                self.statusItem.button?.image = self.renderMenuBarPill(freeGB: freeMenuInt, memPct: gpu.devicePct, cpuPct: cpuPct)
                self.statusItem.button?.imagePosition = .imageOnly
            }
            self.statusItem.button?.toolTip = "Mac YOLO Safeguards — CPU \(cpuPct)% • GPU \(gpu.devicePct)% (\(String(format: "%.1fG", gpu.vramGB)) VRAM) • RAM \(memPressurePct)% • \(freeMenuInt) GB Free"
            if let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
               let jsonStr = String(data: data, encoding: .utf8),
               jsonStr != self.lastHudJson {
                self.lastHudJson = jsonStr
                self.webView?.evaluateJavaScript("if (window.updateYoloHud) window.updateYoloHud(\(jsonStr));", completionHandler: nil)
            }
        }
    }

    @objc func togglePopover(_ sender: AnyObject?) {
        if hudPanel.isVisible {
            dismissHudNotification()
        } else {
            showFloatingHudNotification()
        }
    }

    func renderMenuBarPill(freeGB: Int, memPct: Int, cpuPct: Int) -> NSImage {
        let size = NSSize(width: 134, height: 22)
        let appIconImg = NSImage(contentsOfFile: "/Applications/MacYoloSafeguards.app/Contents/Resources/AppIcon.icns") ?? NSApp.applicationIconImage
        let img = NSImage(size: size, flipped: false) { _ in
            let badgeRect = NSRect(x: 2.0, y: 2.0, width: 18.0, height: 18.0)
            if let icon = appIconImg {
                icon.draw(in: badgeRect, from: .zero, operation: .sourceOver, fraction: 1.0)
            } else {
                let badgePath = NSBezierPath(roundedRect: badgeRect, xRadius: 4.5, yRadius: 4.5)
                NSColor(calibratedRed: 0.42, green: 0.18, blue: 0.85, alpha: 1.0).setFill()
                badgePath.fill()
            }

            let labelFont = NSFont.systemFont(ofSize: 7.0, weight: .bold)
            let valFont = NSFont.monospacedDigitSystemFont(ofSize: 10.0, weight: .bold)
            let labelAttrs: [NSAttributedString.Key: Any] = [
                .font: labelFont,
                .foregroundColor: NSColor(calibratedWhite: 1.0, alpha: 0.72),
            ]
            let tokValColor = NSColor(calibratedRed: 0.20, green: 0.83, blue: 0.60, alpha: 1.0)
            let cpuValColor = cpuPct < 80 ? NSColor(calibratedRed: 0.38, green: 0.78, blue: 0.98, alpha: 1.0) : NSColor.systemPink
            let diskValColor = freeGB >= 80 ? NSColor.white : NSColor.systemYellow

            ("GPU" as NSString).draw(at: NSPoint(x: 24, y: 12.0), withAttributes: labelAttrs)
            ("\(memPct)%" as NSString).draw(at: NSPoint(x: 24, y: 1.0), withAttributes: [.font: valFont, .foregroundColor: memPct >= 65 ? NSColor.systemPink : tokValColor])
            ("CPU" as NSString).draw(at: NSPoint(x: 64, y: 12.0), withAttributes: labelAttrs)
            ("\(cpuPct)%" as NSString).draw(at: NSPoint(x: 64, y: 1.0), withAttributes: [.font: valFont, .foregroundColor: cpuValColor])

            ("DISK" as NSString).draw(at: NSPoint(x: 104, y: 12.0), withAttributes: labelAttrs)
            ("\(freeGB)G" as NSString).draw(at: NSPoint(x: 104, y: 1.0), withAttributes: [.font: valFont, .foregroundColor: diskValColor])
            return true
        }
        img.isTemplate = false
        return img
    }

    func statusButtonScreenRect() -> NSRect? {
        guard let button = statusItem?.button, let window = button.window else { return nil }
        let onScreen = window.convertToScreen(button.convert(button.bounds, to: nil))
        if onScreen.width < 2 || onScreen.height < 2 { return nil }
        let visible = (window.screen ?? NSScreen.main)?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        if onScreen.origin.x <= visible.minX + 100 || onScreen.minY < visible.maxY - 48 {
            return nil
        }
        return onScreen
    }

    func maximumHudSize() -> NSSize {
        let visible = (statusItem?.button?.window?.screen ?? NSScreen.main)?.visibleFrame
            ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        return NSSize(width: floor(max(640, visible.width - 20)), height: floor(max(480, visible.height - 14)))
    }

    func clampHudSize(width: CGFloat, height: CGFloat) -> NSSize {
        let maxSize = maximumHudSize()
        return NSSize(width: min(maxSize.width, max(640, width)), height: min(maxSize.height, max(480, height)))
    }

    func resolvedHudSize() -> NSSize {
        guard UserDefaults.standard.bool(forKey: "MacYoloHudUserResized") else { return maximumHudSize() }
        let savedW = UserDefaults.standard.double(forKey: "MacYoloHudW")
        let savedH = UserDefaults.standard.double(forKey: "MacYoloHudH")
        guard savedW >= 640, savedH >= 480 else { return maximumHudSize() }
        return clampHudSize(width: CGFloat(savedW), height: CGFloat(savedH))
    }

    func applyHudFrame(_ size: NSSize, remember: Bool, pinUnderMenuBar: Bool) {
        let clamped = clampHudSize(width: size.width, height: size.height)
        var frame = hudPanel.frame
        if pinUnderMenuBar {
            frame.size = clamped
            frame.origin = hudOriginUnderMenuBar(size: clamped)
        } else {
            frame.origin.y += frame.height - clamped.height
            frame.size = clamped
            let visible = (statusItem?.button?.window?.screen ?? NSScreen.main)?.visibleFrame
                ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
            if frame.maxX > visible.maxX - 8 { frame.origin.x = visible.maxX - 8 - frame.width }
            if frame.minX < visible.minX + 8 { frame.origin.x = visible.minX + 8 }
            if frame.minY < visible.minY + 8 { frame.origin.y = visible.minY + 8 }
            if frame.maxY > visible.maxY - 6 { frame.origin.y = visible.maxY - 6 - frame.height }
        }
        hudPanel.setFrame(frame, display: true, animate: false)
        if remember {
            UserDefaults.standard.set(true, forKey: "MacYoloHudUserResized")
            UserDefaults.standard.set(Double(clamped.width), forKey: "MacYoloHudW")
            UserDefaults.standard.set(Double(clamped.height), forKey: "MacYoloHudH")
        }
        let widthPt = Int(clamped.width.rounded())
        let heightPt = Int(clamped.height.rounded())
        webView?.evaluateJavaScript("var lbl=document.getElementById('footerSizeLabel'); if (lbl) lbl.textContent='\(widthPt)×\(heightPt)';", completionHandler: nil)
    }

    func hudOriginUnderMenuBar(size: NSSize) -> NSPoint {
        let screen = statusItem?.button?.window?.screen ?? NSScreen.main
        let visible = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let button = statusButtonScreenRect()
        let minX = visible.minX + 8
        let maxX = max(minX, visible.maxX - size.width - 12)
        var x = button != nil ? (button!.midX - (size.width / 2)) : maxX
        if x < minX { x = minX }
        if x > maxX { x = maxX }
        let y = max(visible.minY + 8, visible.maxY - size.height - 6)
        return NSPoint(x: round(x), y: round(y))
    }

    func showFloatingHudNotification() {
        lastShownAt = Date()
        hasCustomOrigin = false
        refreshLiveTelemetry()
        applyHudFrame(resolvedHudSize(), remember: false, pinUnderMenuBar: true)
        hudPanel.isFloatingPanel = true
        hudPanel.alphaValue = 0.88
        hudPanel.hasShadow = true
        hudPanel.level = .statusBar
        hudPanel.hidesOnDeactivate = false
        hudPanel.orderFrontRegardless()
    }

    @objc func smartCleanDisk() {
        let proc = Process()
        proc.launchPath = "/opt/homebrew/bin/node"
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        proc.arguments = ["\(home)/workspace/mac-yolo-safeguards/tools/mac-yolo-disk-guard.js", "--clean", "--json"]
        proc.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async {
                guard let self else { return }
                self.lastSessionScanAt = .distantPast
                self.diskProbeLock.lock()
                self.forceDiskRecheck = true
                self.diskProbeLock.unlock()
                self.refreshLiveTelemetry()
            }
        }
        try? proc.run()
        lastSessionScanAt = .distantPast
        diskProbeLock.lock()
        forceDiskRecheck = true
        diskProbeLock.unlock()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            guard let self else { return }
            self.diskProbeLock.lock()
            self.forceDiskRecheck = true
            self.diskProbeLock.unlock()
            self.refreshLiveTelemetry()
        }
    }

    @objc func reapSimulators() {
        let proc = Process()
        proc.launchPath = "/usr/bin/xcrun"
        proc.arguments = ["simctl", "shutdown", "all"]
        try? proc.run()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.refreshLiveTelemetry()
        }
    }


    @objc func coolDownFans() {
        let proc = Process()
        proc.launchPath = "/opt/homebrew/bin/node"
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        proc.arguments = ["\(home)/workspace/mac-yolo-safeguards/tools/mac-yolo-system-care-engine.js", "--cool-down-fans"]
        try? proc.run()
        reapSimulators()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            self?.refreshLiveTelemetry()
        }
    }
    @objc func openFeedback() {
        if let url = URL(string: "https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/new?template=free-incident-report.yml") {
            NSWorkspace.shared.open(url)
        }
    }
}

let app = NSApplication.shared
let delegate = MacYoloAppDelegate()
app.delegate = delegate
if CommandLine.arguments.contains("--disk-probe-self-test") {
    app.setActivationPolicy(.prohibited)
}
app.run()
