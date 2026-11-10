CLASS zcl_vob_duplicate_store DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES zif_vob_duplicate_store.
ENDCLASS.
CLASS zcl_vob_duplicate_store IMPLEMENTATION.
  METHOD zif_vob_duplicate_store~find.
    IF is_query-vat_number IS NOT INITIAL.
      SELECT lifnr, name1, ort01 FROM lfa1
        WHERE stceg = @is_query-vat_number AND loevm = @abap_false
        INTO TABLE @DATA(lt_vat).
      LOOP AT lt_vat INTO DATA(ls_vat).
        APPEND VALUE #( vendor_number = ls_vat-lifnr name = ls_vat-name1 city = ls_vat-ort01
          matched_on = VALUE #( ( `VAT` ) ) blocked = abap_true ) TO rt_matches.
      ENDLOOP.
    ENDIF.
    IF is_query-iban IS NOT INITIAL.
      " VERIFY IN DEV: TIBAN/LFBK bank key joins, leading zeros and IBAN validity handling.
      SELECT DISTINCT v~lifnr, v~name1, v~ort01 FROM lfa1 AS v
        INNER JOIN lfbk AS b ON b~lifnr = v~lifnr
        INNER JOIN tiban AS i ON i~banks = b~banks AND i~bankl = b~bankl AND i~bankn = b~bankn AND i~bkont = b~bkont
        WHERE i~iban = @is_query-iban AND v~loevm = @abap_false
        INTO TABLE @DATA(lt_iban).
      LOOP AT lt_iban INTO DATA(ls_iban).
        READ TABLE rt_matches ASSIGNING FIELD-SYMBOL(<match>) WITH KEY vendor_number = ls_iban-lifnr.
        IF sy-subrc = 0.
          APPEND `IBAN` TO <match>-matched_on.
          <match>-blocked = abap_true.
        ELSE.
          APPEND VALUE #( vendor_number = ls_iban-lifnr name = ls_iban-name1 city = ls_iban-ort01
            matched_on = VALUE #( ( `IBAN` ) ) blocked = abap_true ) TO rt_matches.
        ENDIF.
      ENDLOOP.
    ENDIF.
    IF is_query-name IS NOT INITIAL AND is_query-post_code IS NOT INITIAL.
      " VERIFY IN DEV: Jones address storage and name/postcode normalisation convention.
      SELECT lifnr, name1, ort01, pstlz FROM lfa1
        WHERE land1 = @is_query-country AND loevm = @abap_false
        INTO TABLE @DATA(lt_names).
      DATA lv_name TYPE string.
      DATA lv_expected TYPE string.
      DATA lv_post TYPE string.
      DATA lv_expected_post TYPE string.
      lv_expected = is_query-name.
      TRANSLATE lv_expected TO UPPER CASE.
      REPLACE ALL OCCURRENCES OF REGEX `[^A-Z0-9]` IN lv_expected WITH ``.
      lv_expected_post = is_query-post_code.
      TRANSLATE lv_expected_post TO UPPER CASE.
      CONDENSE lv_expected_post NO-GAPS.
      LOOP AT lt_names INTO DATA(ls_name).
        lv_name = ls_name-name1.
        TRANSLATE lv_name TO UPPER CASE.
        REPLACE ALL OCCURRENCES OF REGEX `[^A-Z0-9]` IN lv_name WITH ``.
        lv_post = ls_name-pstlz.
        TRANSLATE lv_post TO UPPER CASE.
        CONDENSE lv_post NO-GAPS.
        IF lv_name <> lv_expected OR lv_post <> lv_expected_post.
          CONTINUE.
        ENDIF.
        READ TABLE rt_matches ASSIGNING <match> WITH KEY vendor_number = ls_name-lifnr.
        IF sy-subrc = 0.
          APPEND `NAME_POSTCODE` TO <match>-matched_on.
        ELSE.
          APPEND VALUE #( vendor_number = ls_name-lifnr name = ls_name-name1 city = ls_name-ort01
            matched_on = VALUE #( ( `NAME_POSTCODE` ) ) blocked = abap_false ) TO rt_matches.
        ENDIF.
      ENDLOOP.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
