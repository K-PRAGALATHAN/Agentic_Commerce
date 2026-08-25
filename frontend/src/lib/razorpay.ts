// Loads Razorpay's checkout.js once (test mode). Returns the global constructor.
let loading: Promise<any> | null = null;

export function loadRazorpay(): Promise<any> {
  if ((window as any).Razorpay) return Promise.resolve((window as any).Razorpay);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve((window as any).Razorpay);
    s.onerror = () => reject(new Error('failed to load Razorpay checkout'));
    document.body.appendChild(s);
  });
  return loading;
}
