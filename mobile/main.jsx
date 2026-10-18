import { createRoot } from 'react-dom/client';
import { Component } from 'react';
import App from '../src/App';
import '../src/styles.css';
class MobileRecovery extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main style={{ padding: '48px 24px', maxWidth: 520, margin: 'auto' }}>
      <h1>Let’s reopen Sonora.</h1>
      <p>The screen ran into a problem. Your saved music is kept on this device.</p>
      <button className="primary-button" onClick={() => location.reload()}>Reopen Sonora</button>
    </main> : this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<MobileRecovery><App /></MobileRecovery>);
