import { useState } from 'react'
import Map from './Map';

function App() {
  const [view, setView] = useState<'map' | 'wallet'> ('map');

  return (
    <div>
        <Map />
    </div>
  )
}
export default App
