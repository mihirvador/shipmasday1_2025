'use client';

import dynamic from 'next/dynamic';

const EmailEntry = dynamic(() => import('@/components/EmailEntry'), { ssr: false });

export default function Home() {
  return <EmailEntry />;
}
