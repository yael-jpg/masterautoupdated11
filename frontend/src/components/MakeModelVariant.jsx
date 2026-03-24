import React, { useState, useMemo, useEffect } from 'react'
import { VEHICLE_MAKES } from '../data/vehicleMakes'
import specsData from '../data/vehicleSpecs.json'
import './MakeModelVariant.css'

export default function MakeModelVariant({ value = {}, onChange }) {
  // value = { make, model, variant, customMake }
  const [makeQuery, setMakeQuery] = useState('')
  const [modelQuery, setModelQuery] = useState('')
  const [variantQuery, setVariantQuery] = useState('')

  const [selectedMake, setSelectedMake] = useState(value.make || null)
  const [selectedModel, setSelectedModel] = useState(value.model || null)
  const [selectedVariant, setSelectedVariant] = useState(value.variant || null)
  const [customMake, setCustomMake] = useState(value.customMake || '')

  useEffect(() => {
    onChange && onChange({ make: selectedMake, model: selectedModel, variant: selectedVariant, customMake })
  }, [selectedMake, selectedModel, selectedVariant, customMake, onChange])

  const filteredMakes = useMemo(() => {
    const q = makeQuery.trim().toLowerCase()
    return VEHICLE_MAKES.filter(m => m.name.toLowerCase().includes(q))
  }, [makeQuery])

  const modelsForMake = useMemo(() => {
    if (!selectedMake) return []
    const m = specsData[selectedMake] || {}
    const arr = Object.keys(m)
    if (modelQuery.trim()) return arr.filter(md => md.toLowerCase().includes(modelQuery.trim().toLowerCase()))
    return arr
  }, [selectedMake, modelQuery])

  const variantsForModel = useMemo(() => {
    if (!selectedMake || !selectedModel) return []
    const list = (specsData[selectedMake] && specsData[selectedMake][selectedModel]) || []
    if (variantQuery.trim()) return list.filter(v => v.toLowerCase().includes(variantQuery.trim().toLowerCase()))
    return list
  }, [selectedMake, selectedModel, variantQuery])

  function handleSelectMake(name) {
    if (name === 'Other (Specify)') {
      setSelectedMake(null)
      setCustomMake('')
    } else {
      setSelectedMake(name)
      setCustomMake('')
    }
    setSelectedModel(null)
    setSelectedVariant(null)
  }

  return (
    <div className="mmv-wrap">
      <div className="mmv-row">
        <div className="mmv-col">
          <label className="settings-field-label">Make</label>
          <input className="settings-input" placeholder="Search make…" value={makeQuery} onChange={(e) => setMakeQuery(e.target.value)} />
          <div className="mmv-list">
            {filteredMakes.map(m => (
              <button key={m.name} type="button" className={`mmv-item${selectedMake === m.name ? ' mmv-item--active' : ''}`} onClick={() => handleSelectMake(m.name)}>
                {m.name}
              </button>
            ))}
          </div>
          {selectedMake === null && customMake === '' && (
            <div className="mmv-other-note">Other selected — please specify below.</div>
          )}
          { (selectedMake === null || filteredMakes.find(f => f.name === 'Other (Specify)')) && (
            <div className="mmv-other-input">
              <label className="settings-field-label">Custom Make</label>
              <input className="settings-input" value={customMake} onChange={(e) => setCustomMake(e.target.value)} placeholder="Enter custom make" />
            </div>
          )}
        </div>

        <div className="mmv-col">
          <label className="settings-field-label">Model</label>
          <input className="settings-input" placeholder={selectedMake ? 'Search model…' : 'Select make first'} value={modelQuery} onChange={(e) => setModelQuery(e.target.value)} disabled={!selectedMake} />
          <div className="mmv-list">
            {modelsForMake.length === 0 && <div className="mmv-hint">{selectedMake ? 'No models found' : 'Select make first'}</div>}
            {modelsForMake.map(md => (
              <button key={md} type="button" className={`mmv-item${selectedModel === md ? ' mmv-item--active' : ''}`} onClick={() => { setSelectedModel(md); setSelectedVariant(null) }} disabled={!selectedMake}>
                {md}
              </button>
            ))}
          </div>
        </div>

        <div className="mmv-col">
          <label className="settings-field-label">Variant</label>
          <input className="settings-input" placeholder={selectedModel ? 'Search variant…' : 'Select model first'} value={variantQuery} onChange={(e) => setVariantQuery(e.target.value)} disabled={!selectedModel} />
          <div className="mmv-list">
            {variantsForModel.length === 0 && <div className="mmv-hint">{selectedModel ? 'No variants found' : 'Select model first'}</div>}
            {variantsForModel.map(v => (
              <button key={v} type="button" className={`mmv-item${selectedVariant === v ? ' mmv-item--active' : ''}`} onClick={() => setSelectedVariant(v)} disabled={!selectedModel}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
