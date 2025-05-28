"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, MessageSquare } from 'lucide-react'; // Or another suitable icon for support

export default function NotFoundPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-4xl font-bold text-destructive">
            404
          </CardTitle>
          <CardDescription className="mt-2 text-xl font-semibold">
            Page Not Found
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </CardContent>
        <CardFooter className="mt-6 flex flex-col sm:flex-row sm:justify-center gap-4">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="w-full sm:w-auto group"
          >
            <ArrowLeft className="mr-2 h-4 w-4 transition-transform duration-150 ease-in-out group-hover:scale-110" />
            Go Back
          </Button>
          <Button
            variant="default"
            className="w-full sm:w-auto"
            asChild
          >
            <Link href="/account/support">
              <MessageSquare className="mr-2 h-4 w-4" />
              Contact Support
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}