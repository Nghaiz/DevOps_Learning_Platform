/**
 * Theme sáng / tối. Server-safe: không có `'use client'`, không import React.
 *
 * Khoá localStorage `dlp.theme` dùng chung với phần giao diện cũ còn giữ (landing,
 * game) nên hai bên luôn cùng một lựa chọn. `e2e/csp.spec.ts` đọc HTML thô và đòi
 * script này mang nonce và chứa đúng chuỗi khoá.
 */

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'dlp.theme';

/**
 * Chạy trong `<head>` trước khi vẽ, đặt class `dark` lên `<html>` để không nháy màu.
 * Là chuỗi chứ không phải hàm vì nó phải chạy trước mọi bundle JS.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}';var v=localStorage.getItem(k);var c=(v==='light'||v==='dark'||v==='system')?v:'system';var d=c==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):c;var el=document.documentElement;if(d==='dark'){el.classList.add('dark')}else{el.classList.remove('dark')}}catch(e){}})();`;

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system';
}
