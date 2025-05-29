// src/app/admin/settings/page.js
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, XCircle, Settings, Database, Key, AlertTriangle, Loader2, Info } from "lucide-react";

// Import the setup functions
import { 
  runPasskeySetup, 
  checkPasskeyCollections,
  cleanupExpiredChallenges 
} from "@/lib/cms/server/passkey_setup";

// Import the new configuration functions
import {
  getPasskeyConfigStatus,
  getPasskeyEnvVarsForDisplay,
  validatePasskeyConfig
} from "@/lib/cms/server/passkey_config";

export default function AdminSettingsPage() {
  const [setupStatus, setSetupStatus] = useState({
    isLoading: false,
    hasChecked: false,
    collectionsExist: false,
    setupComplete: false,
    error: null,
    successMessage: null
  });

  const [cleanupStatus, setCleanupStatus] = useState({
    isLoading: false,
    lastCleanup: null,
    error: null
  });

  // New state for configuration status
  const [configStatus, setConfigStatus] = useState({
    isLoading: true,
    data: null,
    error: null
  });

  const [envVars, setEnvVars] = useState([]);

  // Check collections status and configuration on page load
  useEffect(() => {
    checkCollectionsStatus();
    loadConfigurationStatus();
  }, []);

  const checkCollectionsStatus = async () => {
    setSetupStatus(prev => ({ ...prev, isLoading: true, hasChecked: false }));
    
    try {
      const result = await checkPasskeyCollections();
      setSetupStatus(prev => ({
        ...prev,
        isLoading: false,
        hasChecked: true,
        collectionsExist: result.exists,
        setupComplete: result.exists,
        error: result.success ? null : result.message
      }));
    } catch (error) {
      setSetupStatus(prev => ({
        ...prev,
        isLoading: false,
        hasChecked: true,
        error: error.message || "Failed to check collections status"
      }));
    }
  };

  // New function to load configuration status
  const loadConfigurationStatus = async () => {
    setConfigStatus(prev => ({ ...prev, isLoading: true }));
    
    try {
      const [statusResult, envVarsResult] = await Promise.all([
        getPasskeyConfigStatus(),
        getPasskeyEnvVarsForDisplay()
      ]);

      setConfigStatus({
        isLoading: false,
        data: statusResult,
        error: null
      });

      setEnvVars(envVarsResult);
    } catch (error) {
      setConfigStatus({
        isLoading: false,
        data: null,
        error: error.message || "Failed to load configuration status"
      });
    }
  };

  const handleSetupCollections = async () => {
    setSetupStatus(prev => ({ 
      ...prev, 
      isLoading: true, 
      error: null, 
      successMessage: null 
    }));

    try {
      const result = await runPasskeySetup();
      
      if (result.success) {
        setSetupStatus(prev => ({
          ...prev,
          isLoading: false,
          collectionsExist: true,
          setupComplete: true,
          successMessage: result.message || "Passkey collections setup completed successfully!"
        }));
      } else {
        setSetupStatus(prev => ({
          ...prev,
          isLoading: false,
          error: result.message || "Setup failed"
        }));
      }
    } catch (error) {
      setSetupStatus(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || "An unexpected error occurred during setup"
      }));
    }
  };

  const handleCleanupChallenges = async () => {
    setCleanupStatus(prev => ({ 
      ...prev, 
      isLoading: true, 
      error: null 
    }));

    try {
      const result = await cleanupExpiredChallenges();
      
      if (result.success) {
        setCleanupStatus(prev => ({
          ...prev,
          isLoading: false,
          lastCleanup: new Date().toLocaleString(),
          error: null
        }));
      } else {
        setCleanupStatus(prev => ({
          ...prev,
          isLoading: false,
          error: result.message || "Cleanup failed"
        }));
      }
    } catch (error) {
      setCleanupStatus(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || "An unexpected error occurred during cleanup"
      }));
    }
  };

  const getStatusBadge = () => {
    if (setupStatus.isLoading) {
      return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Checking...</Badge>;
    }
    
    if (!setupStatus.hasChecked) {
      return <Badge variant="secondary">Unknown</Badge>;
    }
    
    if (setupStatus.setupComplete) {
      return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Ready</Badge>;
    }
    
    return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Not Setup</Badge>;
  };

  const getConfigurationBadge = () => {
    if (configStatus.isLoading) {
      return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Loading...</Badge>;
    }
    
    if (configStatus.error) {
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
    }
    
    if (configStatus.data?.isConfigured) {
      return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Configured</Badge>;
    }
    
    return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Incomplete</Badge>;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-2">
        <Settings className="w-8 h-8" />
        <div>
          <h1 className="text-3xl font-bold">Admin Settings</h1>
          <p className="text-muted-foreground">Manage system configuration and setup</p>
        </div>
      </div>

      <Separator />

      {/* Configuration Status Section - NEW */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Info className="w-5 h-5" />
              <CardTitle>Configuration Status</CardTitle>
            </div>
            {getConfigurationBadge()}
          </div>
          <CardDescription>
            Current passkey configuration status and environment validation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {configStatus.error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{configStatus.error}</AlertDescription>
            </Alert>
          )}

          {configStatus.data && (
            <>
              {/* Configuration Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Environment</h4>
                  <div className="flex items-center space-x-2">
                    <Badge variant={configStatus.data.environment === 'production' ? 'default' : 'secondary'}>
                      {configStatus.data.environment}
                    </Badge>
                    {configStatus.data.config.developmentMode && (
                      <Badge variant="outline">Development Mode</Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Passkey Status</h4>
                  <div className="flex items-center space-x-2">
                    <Badge variant={configStatus.data.config.enabled ? 'default' : 'secondary'}>
                      {configStatus.data.config.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Configuration Details */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Current Configuration</h4>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">RP Name:</span>
                    <code className="bg-muted px-2 py-1 rounded text-xs">{configStatus.data.config.rpName}</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">RP ID:</span>
                    <code className="bg-muted px-2 py-1 rounded text-xs">{configStatus.data.config.rpId}</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Origin:</span>
                    <code className="bg-muted px-2 py-1 rounded text-xs">{configStatus.data.config.origin}</code>
                  </div>
                </div>
              </div>

              {/* Validation Warnings */}
              {configStatus.data.validation.warnings.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Configuration Warnings:</strong>
                    <ul className="list-disc list-inside mt-1">
                      {configStatus.data.validation.warnings.map((warning, index) => (
                        <li key={index} className="text-sm">{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Missing Configuration */}
              {configStatus.data.validation.missing.length > 0 && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Missing Required Configuration:</strong>
                    <ul className="list-disc list-inside mt-1">
                      {configStatus.data.validation.missing.map((missing, index) => (
                        <li key={index} className="text-sm font-mono">{missing}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Recommendations */}
              {configStatus.data.recommendations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Recommendations</h4>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    {configStatus.data.recommendations.map((rec, index) => (
                      <li key={index}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          <Button
            onClick={loadConfigurationStatus}
            variant="outline"
            disabled={configStatus.isLoading}
          >
            {configStatus.isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4 mr-2" />
            )}
            Refresh Configuration
          </Button>
        </CardContent>
      </Card>

      {/* Passkey Collections Section - Updated */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Database className="w-5 h-5" />
              <CardTitle>Database Collections</CardTitle>
            </div>
            {getStatusBadge()}
          </div>
          <CardDescription>
            Set up and manage passkey authentication collections in your Appwrite database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Messages */}
          {setupStatus.error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{setupStatus.error}</AlertDescription>
            </Alert>
          )}

          {setupStatus.successMessage && (
            <Alert className="border-green-500 bg-green-50 text-green-700">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{setupStatus.successMessage}</AlertDescription>
            </Alert>
          )}

          {/* Setup Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Collections Status</h4>
              <div className="text-sm text-muted-foreground">
                {setupStatus.hasChecked ? (
                  setupStatus.collectionsExist ? (
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span>Collections are configured and ready</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <XCircle className="w-4 h-4 text-red-500" />
                      <span>Collections need to be created</span>
                    </div>
                  )
                ) : (
                  <div className="flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Checking status...</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Required Collections</h4>
              <div className="text-sm text-muted-foreground space-y-1">
                <div>• passkey_challenges (passKeyChallenges)</div>
                <div>• passkey_credentials (passKeyCredentials)</div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <Button
              onClick={handleSetupCollections}
              disabled={setupStatus.isLoading || (configStatus.data && !configStatus.data.isConfigured)}
              variant={setupStatus.setupComplete ? "outline" : "default"}
            >
              {setupStatus.isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  <Database className="w-4 h-4 mr-2" />
                  {setupStatus.setupComplete ? "Re-run Setup" : "Setup Collections"}
                </>
              )}
            </Button>

            <Button
              onClick={checkCollectionsStatus}
              variant="outline"
              disabled={setupStatus.isLoading}
            >
              {setupStatus.isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Check Status
            </Button>
          </div>

          {/* Show warning if configuration is incomplete */}
          {configStatus.data && !configStatus.data.isConfigured && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Configuration is incomplete. Please fix the missing environment variables before running setup.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Maintenance Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="w-5 h-5" />
            <span>Maintenance</span>
          </CardTitle>
          <CardDescription>
            Perform maintenance tasks and cleanup operations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Cleanup Status */}
          {cleanupStatus.error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{cleanupStatus.error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Challenge Cleanup</h4>
            <p className="text-sm text-muted-foreground">
              Remove expired passkey challenges from the database to keep it clean.
              {cleanupStatus.lastCleanup && (
                <span className="block mt-1">Last cleanup: {cleanupStatus.lastCleanup}</span>
              )}
            </p>
          </div>

          <Button
            onClick={handleCleanupChallenges}
            disabled={cleanupStatus.isLoading || !setupStatus.setupComplete}
            variant="outline"
          >
            {cleanupStatus.isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Cleaning up...
              </>
            ) : (
              <>
                <Database className="w-4 h-4 mr-2" />
                Cleanup Expired Challenges
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Environment Variables Section - Updated */}
      <Card>
        <CardHeader>
          <CardTitle>Environment Configuration</CardTitle>
          <CardDescription>
            Current passkey-related environment variables configuration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {envVars.map((envVar, index) => (
              <div key={index} className="flex items-start justify-between p-3 border rounded-lg">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center space-x-2">
                    <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                      {envVar.key}
                    </code>
                    {envVar.required && (
                      <Badge variant="outline" className="text-xs">Required</Badge>
                    )}
                    {envVar.sensitive && (
                      <Badge variant="secondary" className="text-xs">Sensitive</Badge>
                    )}
                  </div>
                  {envVar.description && (
                    <p className="text-xs text-muted-foreground">{envVar.description}</p>
                  )}
                </div>
                <div className="text-right ml-4">
                  <code className="text-sm text-muted-foreground">
                    {envVar.value === 'Not Set' ? (
                      <span className="text-red-500">Not Set</span>
                    ) : (
                      envVar.value
                    )}
                  </code>
                </div>
              </div>
            ))}
          </div>

          {envVars.some(env => env.value === 'Not Set') && (
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Some required environment variables are not set. Please check your .env.local file.
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={loadConfigurationStatus}
            variant="outline"
            className="mt-4"
            disabled={configStatus.isLoading}
          >
            {configStatus.isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4 mr-2" />
            )}
            Refresh Environment Variables
          </Button>
        </CardContent>
      </Card>

      {/* Setup Instructions - Updated */}
      {(!setupStatus.setupComplete || (configStatus.data && !configStatus.data.isConfigured)) && (
        <Card>
          <CardHeader>
            <CardTitle>Setup Instructions</CardTitle>
            <CardDescription>
              Follow these steps to complete the passkey setup.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">1. Environment Variables</h4>
              <p className="text-sm text-muted-foreground">
                Ensure all required environment variables are set in your .env.local file:
              </p>
              <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
{`# Passkey Configuration
PASSKEY_RP_NAME="CyberITEX"
PASSKEY_RP_ID="localhost"
PASSKEY_ORIGIN="http://localhost:3000"
CMS_COLLECTION_ID_PASSKEY_CHALLENGES="passKeyChallenges"
CMS_COLLECTION_ID_PASSKEY_CREDENTIALS="passKeyCredentials"`}
              </pre>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">2. Install Dependencies</h4>
              <pre className="text-xs bg-muted p-3 rounded-lg">
                npm install @simplewebauthn/server @simplewebauthn/browser
              </pre>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">3. Run Setup</h4>
              <p className="text-sm text-muted-foreground">
                Click the "Setup Collections" button above to create the required database collections.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}