import "./globals.css";

export const metadata = {
  title: "Log Management",
  description: "ระบบ Log Management แบบ multi-tenant (Appliance / SaaS)",
};

// ตั้งธีมก่อนหน้าเว็บแสดงผล (กันหน้าวูบขาวตอนเปิดในโหมดมืด)
const themeInit = `(function(){try{var t=localStorage.getItem("lm-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
