import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'SimpleMailCleaner · Platz für Wichtiges',description:'E-Mails verstehen, Newsletter reduzieren und mit Kontrolle aufräumen.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="de"><body>{children}</body></html>;}
