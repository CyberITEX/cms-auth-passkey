// src/app/register/page.js
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState, useEffect } from "react";
import * as z from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Fingerprint, Lock, AlertCircle, Loader2 } from "lucide-react";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";

// Import your existing registration function
import { registerUser } from "@/lib/cms/server/sdk_account";

// Import passkey functions
import { 
  registerPasskey, 
  checkPasskeySupport,
} from "@/lib/cms/web/passkey_client";

const registerFormSchema = z.object({
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  password: z.string().min(8, {
    message: "Password must be at least 8 characters.",
  }),
  confirmPassword: z.string().min(8, {
    message: "Please confirm your password.",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

const passkeyFormSchema = z.object({
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
});

export default function RegisterPage() {
  const router = useRouter();
  const [registrationMethod, setRegistrationMethod] = useState("password"); // "password" or "passkey"
  const [passkeySupport, setPasskeySupport] = useState(null);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);

  // Traditional registration form
  const passwordForm = useForm({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  // Passkey registration form
  const passkeyForm = useForm({
    resolver: zodResolver(passkeyFormSchema),
    defaultValues: {
      email: "",
    },
  });

  // Check passkey support on component mount
  useEffect(() => {
    const support = checkPasskeySupport();
    setPasskeySupport(support);
  }, []);

  // Traditional password registration
  async function onPasswordSubmit(values) {
    console.log("Password registration submitted:", values);
    try {
      const result = await registerUser({
        email: values.email,
        password: values.password,
        hostURL: window.location.origin,
      });

      if (result.success) {
        console.log("Registration successful:", result.data);
        router.push('/login?status=registration_successful');
      } else {
        console.error("Registration failed:", result.message);
        if (result.message && (result.message.toLowerCase().includes("email is already registered") || result.message.toLowerCase().includes("user_already_exists"))) {
          passwordForm.setError("email", { type: "manual", message: result.message });
        } else {
          passwordForm.setError("root", { type: "manual", message: result.message || "An error occurred during registration." });
        }
      }
    } catch (error) {
      console.error("Unexpected error during registration submission:", error);
      passwordForm.setError("root", { type: "manual", message: "An unexpected server error occurred. Please try again." });
    }
  }

  // Passkey registration
  async function onPasskeySubmit(values) {
    console.log("Passkey registration submitted:", values);
    setIsPasskeyLoading(true);

    try {
      const result = await registerPasskey(values.email);

      if (result.success) {
        console.log("Passkey registration successful:", result.data);
        // User is automatically logged in after passkey registration
        router.push('/account/dashboard');
      } else {
        console.error("Passkey registration failed:", result.message);
        passkeyForm.setError("root", { 
          type: "manual", 
          message: result.message || "Passkey registration failed. Please try again." 
        });
      }
    } catch (error) {
      console.error("Unexpected error during passkey registration:", error);
      passkeyForm.setError("root", { 
        type: "manual", 
        message: "An unexpected error occurred. Please try again." 
      });
    } finally {
      setIsPasskeyLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Create an Account</CardTitle>
          <CardDescription>
            Choose your preferred registration method below.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Registration Method Toggle */}
          <div className="flex space-x-2">
            <Button
              variant={registrationMethod === "password" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setRegistrationMethod("password")}
              type="button"
            >
              <Lock className="w-4 h-4 mr-2" />
              Password
            </Button>
            <Button
              variant={registrationMethod === "passkey" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setRegistrationMethod("passkey")}
              disabled={!passkeySupport?.passkeySupported}
              type="button"
            >
              <Fingerprint className="w-4 h-4 mr-2" />
              Passkey
              {passkeySupport?.passkeySupported && (
                <Badge variant="secondary" className="ml-2 text-xs">New</Badge>
              )}
            </Button>
          </div>

          {/* Passkey Support Warning */}
          {passkeySupport && !passkeySupport.passkeySupported && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Passkeys are not supported in your current browser. Please use password registration or try a different browser.
              </AlertDescription>
            </Alert>
          )}

          {/* Password Registration Form */}
          {registrationMethod === "password" && (
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                <FormField
                  control={passwordForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {passwordForm.formState.errors.root && (
                  <p className="text-sm font-medium text-destructive">{passwordForm.formState.errors.root.message}</p>
                )}
                <Button type="submit" className="w-full" disabled={passwordForm.formState.isSubmitting}>
                  {passwordForm.formState.isSubmitting ? "Creating Account..." : "Create Account"}
                </Button>
              </form>
            </Form>
          )}

          {/* Passkey Registration Form */}
          {registrationMethod === "passkey" && passkeySupport?.passkeySupported && (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <div className="flex justify-center">
                  <div className="p-3 bg-primary/10 rounded-full">
                    <Fingerprint className="w-8 h-8 text-primary" />
                  </div>
                </div>
                <h3 className="font-medium">Register with Passkey</h3>
                <p className="text-sm text-muted-foreground">
                  Use your fingerprint, face, or device PIN to create a secure account. No password required!
                </p>
              </div>

              <Form {...passkeyForm}>
                <form onSubmit={passkeyForm.handleSubmit(onPasskeySubmit)} className="space-y-4">
                  <FormField
                    control={passkeyForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="you@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {passkeyForm.formState.errors.root && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{passkeyForm.formState.errors.root.message}</AlertDescription>
                    </Alert>
                  )}
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isPasskeyLoading}
                  >
                    {isPasskeyLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating Passkey...
                      </>
                    ) : (
                      <>
                        <Fingerprint className="w-4 h-4 mr-2" />
                        Create Account with Passkey
                      </>
                    )}
                  </Button>
                </form>
              </Form>

              <div className="text-center">
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>✓ No password to remember</p>
                  <p>✓ Secure biometric authentication</p>
                  <p>✓ Works across your devices</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col items-center space-y-2 pt-4">
          <Separator className="mb-4" />
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Log in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}