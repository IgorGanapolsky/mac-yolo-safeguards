declare module '@react-native-ai/dev-tools/react-native' {
  type AiSdkTracer = {
    startActiveSpan: (name: string, callback: (span: any) => any) => any;
  };

  export type AiSdkDevToolsConfig = {
    serviceName?: string;
  };

  export function useAiSdkDevTools(config?: AiSdkDevToolsConfig): null;

  export function getAiSdkTracer(config?: AiSdkDevToolsConfig): AiSdkTracer;
}
