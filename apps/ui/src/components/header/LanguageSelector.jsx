import React from 'react'
import { useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { CDropdown, CDropdownItem, CDropdownMenu, CDropdownToggle } from '@coreui/react'
import { api } from '../../api/client'
import { LANGUAGES, setLanguage } from '../../i18n'

// the flags (from the sevens projects' language flags, 48 x 32)
const FLAGS = Object.fromEntries(
  Object.entries(
    import.meta.glob('../../assets/flags/*.png', { eager: true, import: 'default' }),
  ).map(([file, url]) => [file.match(/([a-z]{2})\.png$/)[1], url]),
)

const Flag = ({ code, name, selected }) => (
  <img
    src={FLAGS[code]}
    alt={name}
    title={name}
    style={{
      height: 15,
      width: 'auto',
      borderRadius: 2,
      opacity: selected ? 1 : 0.35,
    }}
  />
)

/**
 * The interface's language (2026-10-31): a dropdown in the header, as the site's switcher - the current
 * flag and code, the languages with their flags. A person's choice is saved in their profile (it follows them); the guest's
 * (a shared account) only in this browser.
 */
const LanguageSelector = () => {
  const { i18n, t } = useTranslation()
  const user = useSelector((state) => state.user)
  const guest = useSelector((state) => state.guest)
  const offered = useSelector((state) => state.uiLanguages)
  const languages = offered?.length ? LANGUAGES.filter((l) => offered.includes(l.code)) : LANGUAGES
  if (languages.length < 2) return null
  const current = languages.find((l) => l.code === i18n.resolvedLanguage) ?? languages[0]
  // saved in the profile first - the page is loaded again in the new language (src/i18n setLanguage)
  const choose = async (code) => {
    if (code === current.code) return
    if (user && !guest) await api.updateProfile({ language: code }).catch(() => {})
    setLanguage(code)
  }
  // one dropdown, as the site's switcher: the current flag and code, the languages with their flags
  return (
    <CDropdown variant="nav-item" placement="bottom-end">
      <CDropdownToggle
        caret={false}
        className="d-flex align-items-center"
        aria-label={`${t('Language')}: ${current.name}`}
      >
        <Flag code={current.code} name={current.name} selected />
        {/* 8px after the flag, as the site's switcher */}
        <span className="small text-body-secondary text-uppercase d-none d-sm-inline ms-2">
          {current.code}
        </span>
      </CDropdownToggle>
      <CDropdownMenu>
        {languages.map((l) => (
          <CDropdownItem
            key={l.code}
            as="button"
            type="button"
            active={l.code === current.code}
            lang={l.code}
            className="d-flex align-items-center gap-2"
            onClick={() => choose(l.code)}
          >
            <Flag code={l.code} name={l.name} selected /> {l.name}
          </CDropdownItem>
        ))}
      </CDropdownMenu>
    </CDropdown>
  )
}

export default LanguageSelector
