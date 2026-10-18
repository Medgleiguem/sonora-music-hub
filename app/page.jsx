import App from '../src/App';

export default function Page() {
  return <App hosted={process.env.VERCEL === '1'} />;
}
