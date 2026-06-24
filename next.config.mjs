/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['192.168.0.35'],
  serverExternalPackages: ['node-hid', 'usb', 'shuttle-control-usb'],
};

export default nextConfig;
