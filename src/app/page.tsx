import {redirect} from 'next/navigation';
import {session} from '@/lib/auth';
export default async function Page(){const user=await session();redirect(user?'/dashboard':'/login');}
