export function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "shortMessage" in error) {
    const message = (error as { shortMessage?: unknown }).shortMessage;
    if (typeof message === "string") {
      if (/user rejected|user denied/i.test(message)) return "Transaction was rejected in your wallet.";
      return message;
    }
  }
  if (error instanceof Error) {
    if (/user rejected|user denied/i.test(error.message)) return "Transaction was rejected in your wallet.";
    return error.message;
  }
  return "The transaction could not be completed. Please check your wallet and network.";
}
