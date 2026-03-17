import { TextInput } from '../shared/TextInput.jsx'
import { Button } from '../shared/Button.jsx'
import { ToggleField } from '../shared/ToggleField.jsx'
import { useMemo, useState } from 'react'

export function TEQueryForm() {
  const [categoryId, setCategoryId] = useState('')
  const [categoryTreeEnabled, setCategoryTreeEnabled] = useState(false)

  const canUseCategoryTree = useMemo(() => {
    const v = String(categoryId ?? '').trim()
    return v.length > 0
  }, [categoryId])

  return (
    <form className="em-form" onSubmit={(e) => e.preventDefault()}>
      <div className="em-form-row em-form-row--wrap">
        <TextInput label="event_id" placeholder="Event / Show" />
        <TextInput label="performer_id" placeholder="Events / Index" />
        <TextInput label="venue_id" placeholder="Events / Index" />
        <TextInput
          label="category_id"
          placeholder="Events / Index"
          value={categoryId}
          onChange={(e) => {
            const next = e.target.value
            setCategoryId(next)
            if (String(next ?? '').trim().length === 0) setCategoryTreeEnabled(false)
          }}
        />
        <ToggleField
          label="Subcategories"
          checked={categoryTreeEnabled}
          disabled={!canUseCategoryTree}
          onChange={setCategoryTreeEnabled}
        />
      </div>
      <div className="em-form-actions">
        <Button type="submit" variant="primary">
          Run TE query
        </Button>
      </div>
    </form>
  )
}

