import type { Metadata } from 'next';
import './globals.css';
import './workbench.css';
export const metadata:Metadata={title:'SimpleMailCleaner · Dashboard',description:'Postfächer organisieren, Newsletter reduzieren und E-Mails kontrolliert aufräumen.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="de"><body>{children}</body></html>;}
